// 전역 상태 읽기/쓰기 — rev 낙관적 잠금 (명세 §7, schema.sql §1).
//
// 쓰기는 전부 mutate() 를 거친다: 읽기 → 순수 변형 → UPDATE ... WHERE rev = <읽은 값>.
// 0행이 갱신되면 다른 운영자가 먼저 쓴 것이므로 새로 읽어 변형을 다시 적용한다 (최대 3회).
// lib/tournament.ts 의 전이가 전부 입력을 건드리지 않는 순수 함수인 이유가 이 재시도다.

import 'server-only';
import { supabaseAdmin } from './supabaseAdmin.ts';
import { createInitialState, type TournamentState } from './tournament.ts';
import { deleteLocalVotes, readLocalState, shouldUseLocalStore, writeLocalState } from './localStore.ts';

export type StateRow = { data: TournamentState; rev: number };

const TABLE = 'tournament_state';
const MAX_RETRIES = 3;

function ensureLocalState(): StateRow {
  return migrate(readLocalState());
}

/**
 * 필드가 추가되기 전에 저장된 문서 보정.
 * judges 는 명단제(8/17), matches[].votes 는 투표 오픈 연출(8/18) 이전 행에 없다.
 */
function migrate(row: StateRow): StateRow {
  let data = row.data;
  if (!Array.isArray(data.judges)) {
    data = { ...data, judges: [] };
  }
  if (data.matches.some((m) => m.votes === undefined)) {
    data = { ...data, matches: data.matches.map((m) => ({ ...m, votes: m.votes ?? null })) };
  }
  if (data.teams.some((team, index) => team.character === `char_${String(index + 1).padStart(2, '0')}`)) {
    data = {
      ...data,
      teams: data.teams.map((team, index) =>
        team.character === `char_${String(index + 1).padStart(2, '0')}`
          ? { ...team, character: `team_${String(index + 1).padStart(2, '0')}` }
          : team,
      ),
    };
  }
  return data === row.data ? row : { ...row, data };
}

/** 현재 상태를 읽는다. 행이 없으면 (최초 접근) 초기 브래킷으로 만들고 그 값을 돌려준다. */
export async function ensureState(): Promise<StateRow> {
  if (shouldUseLocalStore()) return ensureLocalState();

  const db = supabaseAdmin();

  const { data, error } = await db.from(TABLE).select('data, rev').eq('id', 1).maybeSingle();
  if (error) throw new Error(`상태 읽기 실패: ${error.message}`);
  if (data) return migrate(data as StateRow);

  // 최초 접근 — 초기 브래킷으로 생성. 동시에 두 요청이 들어와도
  // id=1 PK 충돌로 한쪽만 성공하므로, 실패하면 그냥 다시 읽는다.
  const initial = createInitialState();
  const inserted = await db.from(TABLE).insert({ id: 1, data: initial, rev: 1 });
  if (inserted.error && inserted.error.code !== '23505') {
    throw new Error(`상태 초기화 실패: ${inserted.error.message}`);
  }

  const reread = await db.from(TABLE).select('data, rev').eq('id', 1).single();
  if (reread.error) throw new Error(`상태 재읽기 실패: ${reread.error.message}`);
  return migrate(reread.data as StateRow);
}

/**
 * 상태 변형. fn 은 순수해야 한다 — 충돌 시 갓 읽은 상태로 다시 호출된다.
 * fn 이 던지는 예외(가드 위반 등)는 재시도하지 않고 그대로 올린다.
 */
export async function mutate(
  fn: (state: TournamentState) => TournamentState,
): Promise<StateRow> {
  if (shouldUseLocalStore()) {
    const current = ensureLocalState();
    const next = { data: fn(current.data), rev: current.rev + 1 };
    writeLocalState(next);
    return next;
  }

  const db = supabaseAdmin();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const current = await ensureState();
    const next = fn(current.data);

    const { data, error } = await db
      .from(TABLE)
      .update({ data: next, rev: current.rev + 1, updated_at: new Date().toISOString() })
      .eq('id', 1)
      .eq('rev', current.rev)
      .select('rev');
    if (error) throw new Error(`상태 쓰기 실패: ${error.message}`);

    // rev 가드에 걸려 0행 갱신 → 누가 먼저 썼다. 다시 읽어 재시도.
    if (data && data.length > 0) {
      return { data: next, rev: current.rev + 1 };
    }
  }

  throw new Error('상태 쓰기 충돌이 계속됩니다. 다른 운영자와 동시에 조작 중인지 확인하세요.');
}

/**
 * 공개용 스냅샷 — 비밀값을 벗겨낸다.
 * GET /api/state 는 반드시 이걸 거쳐야 한다 (HANDOFF §3: judgeCode/adminPin 제거).
 */
export function toPublicState(row: StateRow): {
  teams: TournamentState['teams'];
  matches: TournamentState['matches'];
  timer: TournamentState['timer'];
  finalRankingShown: boolean;
  rev: number;
} {
  const { teams, matches } = row.data;
  // timer ?? null: 필드 도입(8/19) 전 문서에는 없다
  return { teams, matches, timer: row.data.timer ?? null, finalRankingShown: row.data.finalRankingShown === true, rev: row.rev };
}

/** 전체 초기화의 vote 쪽 — 모든 제출 레코드 삭제 (명세 §5). */
export async function deleteAllVotes(): Promise<void> {
  if (shouldUseLocalStore()) {
    deleteLocalVotes();
    return;
  }

  const { error } = await supabaseAdmin().from('votes').delete().neq('match_id', '');
  if (error) throw new Error(`제출 기록 삭제 실패: ${error.message}`);
}
