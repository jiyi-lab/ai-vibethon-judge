import 'server-only';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInitialState, type TournamentState } from './tournament.ts';
import type { VoteRow } from './votes.ts';

export type LocalStateRow = { data: TournamentState; rev: number };

type LocalData = {
  state: LocalStateRow | null;
  votes: VoteRow[];
};

const FILE = path.join(process.cwd(), 'ai-vibethon.local.json');
const DEFAULT_LOCAL_JUDGES = ['고보승', '최상일', '박재현'];

export function shouldUseLocalStore(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * 배포 환경에서 파일 저장소로 떨어지는 것을 막는다 (2026-08-31).
 *
 * Supabase 환경 변수가 없으면 shouldUseLocalStore() 가 조용히 true 가 되는데,
 * Vercel 에서 그러면 최악이다 — 파일시스템이 읽기 전용이라 첫 쓰기에서 터지고,
 * 설령 써지더라도 람다 인스턴스마다 서로 다른 대진표를 들게 된다.
 * "왜 심사 결과가 왔다 갔다 하지"를 행사 중에 디버깅하는 대신 원인을 그대로 말한다.
 *
 * 빌드는 이 경로를 타지 않으므로 키 없이 도는 CI 빌드는 그대로 통과한다.
 */
function assertLocalStoreAllowed(): void {
  if (!process.env.VERCEL) return;
  throw new Error(
    'Supabase 환경 변수가 없어 로컬 파일 저장소로 떨어졌습니다. Vercel 프로젝트 설정 > ' +
      'Environment Variables 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 를 ' +
      '등록한 뒤 다시 배포하세요.',
  );
}

function readData(): LocalData {
  assertLocalStoreAllowed();
  if (!existsSync(FILE)) return { state: null, votes: [] };
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<LocalData>;
    return {
      state: parsed.state ?? null,
      votes: Array.isArray(parsed.votes) ? parsed.votes : [],
    };
  } catch {
    return { state: null, votes: [] };
  }
}

function writeData(data: LocalData): void {
  assertLocalStoreAllowed();
  writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8');
}

export function readLocalState(): LocalStateRow {
  const data = readData();
  if (data.state) return data.state;

  const state = { data: createInitialState({ judges: DEFAULT_LOCAL_JUDGES }), rev: 1 };
  writeData({ ...data, state });
  return state;
}

export function writeLocalState(state: LocalStateRow): void {
  writeData({ ...readData(), state });
}

export function upsertLocalVote(vote: VoteRow): void {
  const data = readData();
  const key = (v: VoteRow) => `${v.match_id}:${v.judge_slug}`;
  const votes = data.votes.filter((v) => key(v) !== key(vote));
  votes.push(vote);
  writeData({ ...data, votes });
}

export function readLocalVotes(matchId: string): VoteRow[] {
  return readData().votes
    .filter((vote) => vote.match_id === matchId)
    .sort((a, b) => a.ts - b.ts);
}

export function deleteLocalVotes(): void {
  writeData({ ...readData(), votes: [] });
}
