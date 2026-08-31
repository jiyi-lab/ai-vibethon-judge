// 토너먼트 브래킷 로직 — 순수 함수만.
//
// DB·React 에 의존하지 않는다. 서버의 mutate() 는 "읽기 → 변형 → rev 가드 쓰기 → 충돌 시 재시도"
// 순서로 도는데, 재시도 때 갓 읽은 상태에 같은 변형을 다시 적용해야 하므로
// 여기의 모든 전이는 입력을 건드리지 않고 새 상태를 돌려준다.
//
// 규칙 근거는 docs/SPEC.md §2 (행사 규정, 변경 불가) 와 §5 (상태 전이).

// ------------------------------------------------------------
// 타입
// ------------------------------------------------------------

export const TRACKS = ['SJF', 'AAC', 'LIKELION', 'OPEN'] as const;
export type Track = (typeof TRACKS)[number];

export const TEAM_COUNT = 8;

/** 카드 이미지 키. `team_01` 은 public/team-cards, `char_01` 은 public/characters 로 해석한다. */
export type CharacterKey = string;

export type Team = {
  character: CharacterKey | null;
  school: string;
  team: string;
  track: Track;
};

export type MatchId = 'R1-1' | 'R1-2' | 'R1-3' | 'R1-4' | 'R2-1' | 'R2-2' | 'F';
export type Round = 1 | 2 | 3;
export type MatchStatus = 'ready' | 'live' | 'done';

/** 경기 내 자리. 심사 제출(votes.winner)과 같은 표기를 쓴다. */
export type Side = 'A' | 'B';

export type Match = {
  id: MatchId;
  round: Round;
  /** 팀 인덱스(0~7). 상위 라운드는 추첨/확정 전까지 null. */
  a: number | null;
  b: number | null;
  status: MatchStatus;
  winner: Side | null;
  /**
   * 결과 공개 시점의 표 (스크린 투표 오픈 연출용, §6.1).
   * 서버가 순서를 정해(R1·R2 는 심사위원 명단 순서 8/25 / 결선은 연출 정렬 §6.1 8/22)
   * 저장한다. 공개 전(ready/live)에는 null.
   */
  votes: Side[] | null;
  scoreSummary?: Record<Side, number> | null;
  /**
   * votes 와 같은 순서의 심사위원 이름 (§6.1 8/22 저녁 — 정지 화면 카드에 명의 표기,
   * 운영자 결정으로 §3 "명의를 떼고 공개" 원칙 번복). 도입 전 데이터에는 없다 —
   * 없으면 스크린은 이름 없이 카드만 그린다.
   */
  voteNames?: string[] | null;
  /**
   * 발표 확정 (8/22 신설, §6.1 2단계 공개): revealResult(카드 오픈·정지) 후
   * 심사위원 코멘트 시간이 지나고 운영자가 announceResult 를 눌러야 true.
   * 스크린은 이때 결과 화면 → 대진표로 넘어간다. 옵셔널: 도입 전 문서에는 없다.
   */
  announced?: boolean;
};

// ------------------------------------------------------------
// 라운드 타이머 (SPEC §6.2, 2026-08-19 개정 — 운영 구동 서버 동기)
// ------------------------------------------------------------

export type TimerPreset = { label: string; seconds: number };

/** 라운드별 프리셋. 경기 시작 시 첫 항목이 자동 시작된다. */
export const TIMER_PRESETS: Record<Round, TimerPreset[]> = {
  1: [
    { label: '발표', seconds: 5 * 60 },
    { label: '공통 Q&A', seconds: 8 * 60 },
  ],
  2: [
    { label: '시연', seconds: 3 * 60 },
    { label: '기술 Q&A', seconds: 5 * 60 },
  ],
  3: [
    { label: '라스트 어필', seconds: 100 },
    { label: '심사 합의', seconds: 100 },
  ],
};

/**
 * 진행 중 타이머. 서버는 **시작 시각만** 기록하고 남은 시간은 각 기기가 계산한다 —
 * 폴링 지연(3초)이 있어도 남은 시간 자체는 어긋나지 않는다.
 * 일시정지는 없다: 중앙 시계의 정지 상태 관리는 당일 운영 복잡도만 높인다 — 재시작으로 갈음.
 */
export type TimerState = {
  matchId: MatchId;
  label: string;
  seconds: number;
  /** epoch ms (서버 시각) */
  startedAt: number;
};

/**
 * tournament_state.data 에 통째로 들어가는 jsonb 문서.
 *
 * rev 는 여기 없다. 낙관적 잠금은 tournament_state.rev **컬럼**이 담당하고,
 * 문서 안에도 두면 두 값이 반드시 어긋난다. API 응답에서만 합쳐 내려보낸다.
 */
export type TournamentState = {
  teams: Team[];
  matches: Match[];
  /** 심사위원 명단 (SPEC §3 명단제). 명단 밖 명의의 제출은 서버가 거부한다. */
  judges: string[];
  judgeCode: string;
  adminPin: string;
  /** 진행 중 타이머. 옵셔널인 이유: 이 필드 도입(8/19) 전에 저장된 문서에는 없다. */
  timer?: TimerState | null;
};

// ------------------------------------------------------------
// 에러
// ------------------------------------------------------------

export type TournamentErrorCode =
  | 'MATCH_NOT_FOUND'
  | 'BRACKET_UNRESOLVED'
  | 'ALREADY_DONE'
  | 'NOT_DONE'
  | 'ALREADY_ANNOUNCED'
  | 'INVALID_PAIRS'
  | 'NOT_LIVE'
  | 'ROUND1_INCOMPLETE'
  | 'ROUND2_INCOMPLETE'
  | 'ALREADY_DRAWN'
  | 'FINAL_ALREADY_SET'
  | 'INVALID_TEAM_INDEX'
  | 'INVALID_TRACK'
  | 'INVALID_TIMER_LABEL'
  | 'INVALID_CODE'
  | 'INVALID_JUDGE_NAME'
  | 'JUDGE_DUPLICATE'
  | 'JUDGE_NOT_FOUND';

/** 가드 위반. API 라우트에서 code 로 상태 코드를, message 로 운영 화면 문구를 만든다. */
export class TournamentError extends Error {
  readonly code: TournamentErrorCode;

  constructor(code: TournamentErrorCode, message: string) {
    super(message);
    this.name = 'TournamentError';
    this.code = code;
  }
}

// ------------------------------------------------------------
// 초기 상태
// ------------------------------------------------------------

const DEFAULT_TEAM_NAMES = ['1팀', '2팀', '4팀', '5팀', '6팀', '7팀', '8팀', '9팀'];
const EMPTY_TEAM: Team = { character: null, school: '', team: '', track: 'OPEN' };

/**
 * 8팀 빈 슬롯 + 7경기. SPEC §4.1 의 모양 그대로.
 *
 * R1 대진은 teams 배열의 인접 쌍으로 고정한다([0]-[1], [2]-[3], ...).
 * 같은 트랙끼리 붙이는 건 운영자가 팀 관리 화면에서 순서로 맞추고,
 * 어긋나면 trackWarnings() 가 경고한다 (SPEC §2 — R1 은 같은 트랙끼리).
 */
export function createInitialState(overrides?: Partial<TournamentState>): TournamentState {
  return {
    teams: Array.from({ length: TEAM_COUNT }, (_, i) => ({
      character: `team_${String(i + 1).padStart(2, '0')}`,
      school: '',
      team: DEFAULT_TEAM_NAMES[i] ?? `${i + 1}팀`,
      track: 'OPEN',
    })),
    matches: [
      { id: 'R1-1', round: 1, a: 0, b: 1, status: 'ready', winner: null, votes: null },
      { id: 'R1-2', round: 1, a: 2, b: 3, status: 'ready', winner: null, votes: null },
      { id: 'R1-3', round: 1, a: 4, b: 5, status: 'ready', winner: null, votes: null },
      { id: 'R1-4', round: 1, a: 6, b: 7, status: 'ready', winner: null, votes: null },
      { id: 'R2-1', round: 2, a: null, b: null, status: 'ready', winner: null, votes: null },
      { id: 'R2-2', round: 2, a: null, b: null, status: 'ready', winner: null, votes: null },
      { id: 'F', round: 3, a: null, b: null, status: 'ready', winner: null, votes: null },
    ],
    judges: [],
    judgeCode: 'AIVIBE',
    adminPin: '0825',
    timer: null,
    ...overrides,
  };
}

export const ROUND1_IDS: MatchId[] = ['R1-1', 'R1-2', 'R1-3', 'R1-4'];
export const ROUND2_IDS: MatchId[] = ['R2-1', 'R2-2'];
export const FINAL_ID: MatchId = 'F';

// ------------------------------------------------------------
// 조회 헬퍼 (읽기 전용)
// ------------------------------------------------------------

export function getMatch(state: TournamentState, matchId: string): Match {
  const match = state.matches.find((m) => m.id === matchId);
  if (!match) throw new TournamentError('MATCH_NOT_FOUND', `경기 ${matchId} 를 찾을 수 없습니다.`);
  return match;
}

/** 진행 중인 경기. SPEC §4.1 — live 는 동시에 1경기만이라 배열이 아닌 단일 값. */
export function liveMatch(state: TournamentState): Match | null {
  return state.matches.find((m) => m.status === 'live') ?? null;
}

/** 대진이 확정됐는지. 미확정 경기는 시작할 수 없다 (SPEC §8). */
export function isResolved(match: Match): boolean {
  return match.a !== null && match.b !== null;
}

/** 승자의 팀 인덱스. 아직 공개 전이면 null. */
export function winningTeamId(match: Match): number | null {
  if (match.winner === null) return null;
  return match.winner === 'A' ? match.a : match.b;
}

export type RoundRankingEntry = {
  teamIndex: number;
  score: number;
  matchId: MatchId;
  side: Side;
};

/**
 * 라운드별 점수 순위. `matches` 만 보므로 파라미터를 그만큼만 받는다 —
 * 스크린은 비밀값을 벗겨낸 공개 스냅샷(PublicState), 콘솔은 AdminState 를 넘기는데
 * TournamentState 를 요구하면 두 화면 모두 타입이 맞지 않아 빌드가 깨진다.
 */
export function roundRankings(state: Pick<TournamentState, 'matches'>, round: Round): RoundRankingEntry[] {
  return state.matches
    .filter((match) => match.round === round && match.status === 'done' && match.scoreSummary)
    .flatMap((match) =>
      (['A', 'B'] as const).flatMap((side) => {
        const teamIndex = side === 'A' ? match.a : match.b;
        const score = match.scoreSummary?.[side];
        return teamIndex === null || score === undefined ? [] : [{ teamIndex, score, matchId: match.id, side }];
      }),
    )
    .sort((a, b) => b.score - a.score || a.teamIndex - b.teamIndex);
}

export function topTeamsForRound(state: Pick<TournamentState, 'matches'>, round: Round, count: number): number[] {
  return roundRankings(state, round)
    .slice(0, count)
    .map((entry) => entry.teamIndex);
}

export function teamAt(state: TournamentState, index: number | null): Team | null {
  if (index === null) return null;
  return state.teams[index] ?? null;
}

/** 결선이 끝났으면 우승팀 인덱스. 스크린의 우승 연출 트리거 (SPEC §6.1). */
export function champion(state: TournamentState): number | null {
  const final = getMatch(state, FINAL_ID);
  if (final.status !== 'done') return null;
  return winningTeamId(final);
}

/**
 * R1 대진 중 트랙이 어긋난 인접 쌍의 경기 ID.
 * 막지는 않고 운영 화면에 경고만 띄운다 — 규정상 R1 은 같은 트랙끼리다 (SPEC §2).
 */
export function trackWarnings(state: TournamentState): MatchId[] {
  return state.matches
    .filter((m) => m.round === 1)
    .filter((m) => {
      const a = teamAt(state, m.a);
      const b = teamAt(state, m.b);
      return a !== null && b !== null && a.track !== b.track;
    })
    .map((m) => m.id);
}

export function canDrawRound2(state: TournamentState): boolean {
  const r1Done = ROUND1_IDS.every((id) => getMatch(state, id).status === 'done');
  const r2Empty = ROUND2_IDS.every((id) => !isResolved(getMatch(state, id)));
  return r1Done && r2Empty && topTeamsForRound(state, 1, 4).length === 4;
}

export function canSetFinal(state: TournamentState): boolean {
  const r2Done = ROUND2_IDS.every((id) => getMatch(state, id).status === 'done');
  return r2Done && !isResolved(getMatch(state, FINAL_ID)) && topTeamsForRound(state, 2, 2).length === 2;
}

// ------------------------------------------------------------
// 셔플
// ------------------------------------------------------------

/** 0 이상 1 미만. 테스트에서 결정적 시퀀스를 주입하려고 분리해 뒀다. */
export type Rng = () => number;

/** Fisher–Yates. 입력 배열은 그대로 두고 새 배열을 돌려준다. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ------------------------------------------------------------
// 상태 전이
//
// 전부 새 상태를 돌려준다. 결과 취소(done → live 롤백)는 만들지 않기로 했으므로
// done 은 종착 상태다 — 공개 버튼 쪽에서 확인 다이얼로그로 오조작을 막는다.
// ------------------------------------------------------------

function replaceMatch(state: TournamentState, id: MatchId, patch: Partial<Match>): TournamentState {
  return {
    ...state,
    matches: state.matches.map((m) => (m.id === id ? { ...m, ...patch } : m)),
  };
}

/**
 * 경기 시작. 대진 미확정이면 거부하고, 기존 live 경기는 ready 로 되돌린다
 * (SPEC §4.1 — live 는 동시에 1경기).
 *
 * 타이머는 해당 라운드 첫 프리셋으로 자동 시작한다 (§6.2 개정 8/19 — 심사위원이
 * 누르는 게 아니라 운영 액션에 따라 돈다). now 를 인자로 받는 이유: 전이가
 * mutate() 재시도에서 재적용되므로 순수해야 하고, 테스트에서 시각을 고정해야 한다.
 */
export function startMatch(
  state: TournamentState,
  matchId: string,
  now: number = Date.now(),
): TournamentState {
  const target = getMatch(state, matchId);

  if (target.status === 'done') {
    throw new TournamentError('ALREADY_DONE', `${target.id} 은 이미 결과가 공개된 경기입니다.`);
  }
  if (!isResolved(target)) {
    throw new TournamentError('BRACKET_UNRESOLVED', `${target.id} 은 대진이 아직 확정되지 않았습니다.`);
  }

  const first = TIMER_PRESETS[target.round][0];
  return {
    ...state,
    matches: state.matches.map((m) => {
      if (m.id === target.id) return { ...m, status: 'live' as const };
      if (m.status === 'live') return { ...m, status: 'ready' as const };
      return m;
    }),
    timer: { matchId: target.id, label: first.label, seconds: first.seconds, startedAt: now },
  };
}

/**
 * 타이머 단계 전환/재시작 — live 경기의 라운드 프리셋 중 하나를 지금부터 다시 센다.
 * 운영 화면 전용 (§6.3). 같은 label 을 다시 누르면 재시작이 된다.
 */
export function setTimer(
  state: TournamentState,
  label: string,
  now: number = Date.now(),
): TournamentState {
  const live = liveMatch(state);
  if (!live) {
    throw new TournamentError('NOT_LIVE', '진행 중인 경기가 없어 타이머를 시작할 수 없습니다.');
  }
  const preset = TIMER_PRESETS[live.round].find((p) => p.label === label);
  if (!preset) {
    throw new TournamentError(
      'INVALID_TIMER_LABEL',
      `라운드 ${live.round} 의 타이머 단계가 아닙니다: ${label}`,
    );
  }
  return {
    ...state,
    timer: { matchId: live.id, label: preset.label, seconds: preset.seconds, startedAt: now },
  };
}

/**
 * 승자 지정 + 결과 공개. 이 액션이 곧 현장 발표다 (SPEC §2).
 *
 * 심사 제출이 0건이어도 통과시킨다 — 현장 네트워크가 죽어도 운영자 입력만으로
 * 브래킷이 굴러가야 하는 백업 모드가 최소 보장선이다 (SPEC §5).
 * 그래서 표 집계를 판정에 쓰지 않는다. 동표 경고도 운영 화면의 몫이다 (SPEC §3).
 *
 * votes 는 스크린 투표 오픈 연출용 표 — 호출측(서버)이 셔플(결선은 연출 정렬)해 넘긴다.
 * names 는 votes 와 같은 순서의 심사위원 이름 (§6.1 8/22 저녁 — 카드에 명의 표기).
 * 빈 배열(백업 모드)이면 스크린은 표 연출 없이 승자만 발표한다.
 */
export function revealResult(
  state: TournamentState,
  matchId: string,
  winner: Side,
  votes: Side[] = [],
  names: string[] = [],
  scoreSummary?: Record<Side, number>,
): TournamentState {
  const target = getMatch(state, matchId);

  if (target.status === 'done') {
    throw new TournamentError('ALREADY_DONE', `${target.id} 은 이미 결과가 공개됐습니다.`);
  }
  if (target.status !== 'live') {
    throw new TournamentError('NOT_LIVE', `${target.id} 을 먼저 시작해야 결과를 공개할 수 있습니다.`);
  }

  // 공개와 함께 타이머 해제 — 심사 시간이 끝난 화면에 시계가 남아 있으면 안 된다.
  // 결선 특례 (8/22 저녁, MC 큐시트 대조): 결선은 공개 즉시 발표 간주 — [발표] 단계가
  // 없다. 큐시트의 "5-4-3-2-1 → LED 결과 화면"은 코멘트 정지 구간 없이 표 연출이
  // 끝나면 바로 우승 무대가 떠야 하고, 정지 화면을 끼우면 카운트다운 전에 스포일된다
  return {
    ...replaceMatch(state, target.id, {
      status: 'done',
      winner,
      votes: [...votes],
      voteNames: [...names],
      scoreSummary: scoreSummary ?? null,
      ...(target.id === FINAL_ID ? { announced: true } : {}),
    }),
    timer: null,
  };
}

/**
 * 발표 확정 (8/22, §6.1 2단계 공개) — 카드 오픈·정지 화면에서 코멘트를 마친 뒤
 * 결과 화면으로 넘기는 운영자 액션. 표 0건(백업 모드) 공개는 정지 화면이 없으므로
 * 스크린이 announced 로 간주한다 (isAnnounced 참조) — 이 액션은 표가 있을 때만 의미.
 */
export function announceResult(state: TournamentState, matchId: string): TournamentState {
  const target = getMatch(state, matchId);
  if (target.status !== 'done') {
    throw new TournamentError('NOT_DONE', `${target.id} 은 아직 결과가 공개되지 않았습니다.`);
  }
  if (isAnnounced(target)) {
    throw new TournamentError('ALREADY_ANNOUNCED', `${target.id} 은 이미 발표됐습니다.`);
  }
  return replaceMatch(state, target.id, { announced: true });
}

/** 발표까지 끝났는가 — 표 0건 공개(백업 모드)는 정지 화면이 없어 즉시 발표로 친다. */
export function isAnnounced(match: Match): boolean {
  if (match.status !== 'done') return false;
  return match.announced === true || (match.votes?.length ?? 0) === 0;
}

/**
 * 결선 표 공개 순서 (8/22, §6.1) — 셔플 대신 연출 정렬. 규칙:
 * 패자 표가 남아 있는 동안 [패자, 승자] 로 번갈아 깔고, 남은 승자 표를 뒤에 붙인다.
 * 3:2 → 패승패승승 (마지막 장이 승부 확정), 4:1/5:0 → 표 적은 쪽 먼저.
 * 제네릭인 이유(8/22 저녁): 정지 화면에 명의가 실리면서 진영 배열만이 아니라
 * {표, 이름} 쌍 자체를 같은 규칙으로 재배열해야 한다 — 진영은 mark 로 읽는다.
 * 기본 mark 는 원소 그 자체 (Side[] 를 그대로 받던 종전 호출과 호환).
 */
export function finalRevealOrder<T>(
  votes: readonly T[],
  winner: Side,
  mark: (v: T) => Side = (v) => v as unknown as Side,
): T[] {
  const losers = votes.filter((v) => mark(v) !== winner);
  const winners = votes.filter((v) => mark(v) === winner);
  const out: T[] = [];
  let w = 0;
  for (let l = 0; l < losers.length; l += 1) {
    out.push(losers[l]);
    if (w < winners.length) {
      out.push(winners[w]);
      w += 1;
    }
  }
  while (w < winners.length) {
    out.push(winners[w]);
    w += 1;
  }
  return out;
}

/**
 * R1·R2 표 공개 순서 (8/25 운영자) — 셔플 대신 운영 콘솔 심사위원 명단 순서.
 * 카드에 명의가 실리면서(§6.1 8/22 저녁) 무작위 셔플은 경기마다 이름 자리가 튀어
 * 무대와 어긋났다. 명단은 착석·MC 소개 순서와 같으므로 그 순서로 깔면 맞는다.
 *
 * **결선은 이 함수를 쓰지 않는다** — finalRevealOrder 의 연출 정렬(패자 우선
 * 번갈아, 마지막 장이 승부 확정)을 그대로 둔다. 8/25 에 결선까지 명단 순서로
 * 넘겼다가 되돌린 자리다: 명단 순서는 마지막 장이 승부를 확정한다는 보장이 없어
 * (명단 앞쪽이 승자 표로 몰리면 중간에서 확정) 결선 연출이 죽는다. **재론 금지.**
 *
 * 명단에 없는 명의(제출 뒤 삭제된 심사위원)는 뒤로 밀고 서로의 순서는 유지한다 —
 * Array.prototype.sort 가 안정 정렬이라 넘겨받은 순서(ts 오름차순)가 그대로 남는다.
 * 표를 버리지 않는 이유: 집계는 이미 그 표를 세고 있어서 카드만 빠지면 숫자와
 * 카드 수가 어긋난다.
 */
export function judgeRevealOrder<T>(
  votes: readonly T[],
  judges: readonly string[],
  name: (v: T) => string,
): T[] {
  const rank = new Map(judges.map((j, i) => [judgeSlug(j), i]));
  const at = (v: T) => rank.get(judgeSlug(name(v))) ?? Number.MAX_SAFE_INTEGER;
  return [...votes].sort((x, y) => at(x) - at(y));
}

/**
 * 라운드 2 대진 추첨. R1의 경기별 승자가 아니라, R1 전체 총점 상위 4팀을 셔플해
 * R2 두 경기에 채운다. 페어는 공개 연출 단위이고 진출은 라운드 랭킹으로 결정한다.
 */
export function drawRound2(
  state: TournamentState,
  rng: Rng = Math.random,
  /**
   * 수동 대진 (8/22 운영자 결정) — 지정하면 셔플 대신 이 짝을 쓴다:
   * [[R2-1 a, R2-1 b], [R2-2 a, R2-2 b]]. 네 값은 정확히 R1 상위 4팀이어야 한다.
   * 스크린 연출은 어느 쪽이든 동일(셔플 애니메이션) — 무작위성의 출처만 달라진다.
   */
  pairs?: readonly [readonly [number, number], readonly [number, number]],
): TournamentState {
  const pending = ROUND1_IDS.filter((id) => getMatch(state, id).status !== 'done');
  if (pending.length > 0) {
    throw new TournamentError(
      'ROUND1_INCOMPLETE',
      `라운드 1 이 끝나야 추첨할 수 있습니다. 남은 경기: ${pending.join(', ')}`,
    );
  }
  if (ROUND2_IDS.some((id) => isResolved(getMatch(state, id)))) {
    throw new TournamentError('ALREADY_DRAWN', '라운드 2 대진은 이미 추첨됐습니다.');
  }

  const r1Top = topTeamsForRound(state, 1, 4);
  if (r1Top.length < 4) {
    throw new TournamentError('ROUND1_INCOMPLETE', '라운드 1 의 점수 집계가 부족해 상위 4팀을 정할 수 없습니다.');
  }

  let winners: number[];
  if (pairs) {
    winners = [pairs[0][0], pairs[0][1], pairs[1][0], pairs[1][1]];
    const valid =
      winners.length === 4 &&
      new Set(winners).size === 4 &&
      winners.every((w) => r1Top.includes(w));
    if (!valid) {
      throw new TournamentError(
        'INVALID_PAIRS',
        '수동 대진은 R1 총점 상위 4팀을 정확히 한 번씩 배치해야 합니다.',
      );
    }
  } else {
    winners = shuffle(r1Top, rng);
  }

  return {
    ...state,
    matches: state.matches.map((m) => {
      if (m.id === 'R2-1') return { ...m, a: winners[0], b: winners[1] };
      if (m.id === 'R2-2') return { ...m, a: winners[2], b: winners[3] };
      return m;
    }),
  };
}

/** 결선 대진 확정. R2 전체 총점 상위 2팀이 결선으로 간다 (페어 승패 기준 아님). */
export function setFinal(state: TournamentState): TournamentState {
  const pending = ROUND2_IDS.filter((id) => getMatch(state, id).status !== 'done');
  if (pending.length > 0) {
    throw new TournamentError(
      'ROUND2_INCOMPLETE',
      `라운드 2 가 끝나야 결선을 확정할 수 있습니다. 남은 경기: ${pending.join(', ')}`,
    );
  }
  if (isResolved(getMatch(state, FINAL_ID))) {
    throw new TournamentError('FINAL_ALREADY_SET', '결선 대진은 이미 확정됐습니다.');
  }

  const finalists = topTeamsForRound(state, 2, 2);
  if (finalists.length < 2) {
    throw new TournamentError('ROUND2_INCOMPLETE', '라운드 2 의 점수 집계가 부족해 결선 진출 2팀을 정할 수 없습니다.');
  }

  return replaceMatch(state, FINAL_ID, {
    a: finalists[0],
    b: finalists[1],
  });
}

// ------------------------------------------------------------
// 팀 · 설정
// ------------------------------------------------------------

/**
 * 팀 정보 수정. 경기 중에도 오탈자를 고칠 수 있어야 하므로 진행 상태로 막지 않는다.
 * 대진은 인덱스로 잡혀 있어 내용을 바꿔도 브래킷은 흔들리지 않는다.
 */
export function updateTeam(state: TournamentState, index: number, patch: Partial<Team>): TournamentState {
  if (!Number.isInteger(index) || index < 0 || index >= TEAM_COUNT) {
    throw new TournamentError('INVALID_TEAM_INDEX', `팀 인덱스는 0~${TEAM_COUNT - 1} 여야 합니다.`);
  }
  if (patch.track !== undefined && !TRACKS.includes(patch.track)) {
    throw new TournamentError('INVALID_TRACK', `트랙은 ${TRACKS.join(' / ')} 중 하나여야 합니다.`);
  }

  return {
    ...state,
    teams: state.teams.map((t, i) => (i === index ? { ...t, ...patch } : t)),
  };
}

function requireCode(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new TournamentError('INVALID_CODE', `${label} 는 비워 둘 수 없습니다.`);
  }
  return trimmed;
}

export function setJudgeCode(state: TournamentState, code: string): TournamentState {
  return { ...state, judgeCode: requireCode(code, '심사 코드') };
}

export function setAdminPin(state: TournamentState, pin: string): TournamentState {
  return { ...state, adminPin: requireCode(pin, '운영 PIN') };
}

/** 심사 코드 대조. 대소문자·앞뒤 공백 무시 (SPEC §6.2). */
export function matchesJudgeCode(state: TournamentState, input: string): boolean {
  return input.trim().toLowerCase() === state.judgeCode.trim().toLowerCase();
}

// ------------------------------------------------------------
// 심사위원 명단 (SPEC §3 명단제)
// ------------------------------------------------------------

export const JUDGE_NAME_MAX = 30;

/**
 * 명의 키. "김 심사"와 "김심사"가 다른 명의가 되면 재제출 덮어쓰기가 깨지므로
 * NFC 정규화 + 공백 제거 + 소문자화로 통일한다. votes.judge_slug 에 이 값이 들어간다.
 */
export function judgeSlug(name: string): string {
  return name.normalize('NFC').replace(/\s+/g, '').toLowerCase();
}

/** 명단에서 명의를 찾아 등록된 표기 그대로 돌려준다. 없으면 null — 제출 거부 신호. */
export function findJudge(state: TournamentState, name: string): string | null {
  const slug = judgeSlug(name);
  return state.judges.find((j) => judgeSlug(j) === slug) ?? null;
}

export function addJudge(state: TournamentState, name: string): TournamentState {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > JUDGE_NAME_MAX) {
    throw new TournamentError('INVALID_JUDGE_NAME', `이름은 1~${JUDGE_NAME_MAX}자여야 합니다.`);
  }
  if (findJudge(state, trimmed) !== null) {
    // 동명이인은 구분자를 붙여 등록한다 (예: "김OO A") — SPEC §3
    throw new TournamentError('JUDGE_DUPLICATE', `"${trimmed}" 은 이미 등록된 명의입니다.`);
  }
  return { ...state, judges: [...state.judges, trimmed] };
}

export function removeJudge(state: TournamentState, name: string): TournamentState {
  if (findJudge(state, name) === null) {
    throw new TournamentError('JUDGE_NOT_FOUND', `"${name.trim()}" 은 명단에 없습니다.`);
  }
  const slug = judgeSlug(name);
  return { ...state, judges: state.judges.filter((j) => judgeSlug(j) !== slug) };
}

// ------------------------------------------------------------
// 초기화
// ------------------------------------------------------------

/**
 * 브래킷 전체 초기화. 리허설 데이터를 지우고 본 행사에 들어갈 때 쓴다 (SPEC §5).
 * vote 레코드 삭제는 서버 레이어의 몫이다 — **votes 를 먼저 지우고 이걸 호출**해야
 * 경기 ID 재사용 때문에 리허설 표가 본 행사 집계에 섞이지 않는다.
 *
 * 심사 코드·운영 PIN·심사위원 명단은 항상 유지한다 — 초기화하면 운영자가 자기 화면에서 잠기거나
 * 명단을 다시 쳐야 한다. 팀 명단은 기본적으로 남기고, 리허설용 더미였다면 clearTeams 로 비운다.
 */
export function reset(state: TournamentState, opts?: { clearTeams?: boolean }): TournamentState {
  const fresh = createInitialState({
    judgeCode: state.judgeCode,
    adminPin: state.adminPin,
    judges: [...state.judges],
  });
  if (opts?.clearTeams) {
    return { ...fresh, teams: Array.from({ length: TEAM_COUNT }, () => ({ ...EMPTY_TEAM })) };
  }
  return { ...fresh, teams: state.teams.map((t) => ({ ...t })) };
}

/** 리허설 점프 시점 — 큐시트 순서의 체크포인트 (2026-08-24, §6.3). */
export const REHEARSAL_STAGES = [
  'pre',
  'r1-live',
  'r1-done',
  'drawn',
  'r2-done',
  'final-live',
  'champion',
] as const;
export type RehearsalStage = (typeof REHEARSAL_STAGES)[number];

/**
 * 리허설 점프 (2026-08-24 운영자 요청 — "한번 실수하면 매번 초기화") — 경기
 * 상태를 지우고 지정 시점까지 기존 프리미티브로 전진 재구성한다. 팀·명단·
 * 코드는 유지 (reset 과 동일), 지나가는 경기는 전부 A 승·표 0건 (즉시 발표
 * 간주 규칙 활용 — 리허설 표는 심사위원이 그 시점부터 직접 낸다).
 * ⚠ 서버 레이어는 reset 과 같은 이유로 **votes 를 먼저 지우고** 호출할 것.
 */
export function seekStage(
  state: TournamentState,
  stage: RehearsalStage,
  rng: Rng = Math.random,
): TournamentState {
  let s = reset(state);
  /**
   * 지나가는 경기는 전부 A 승 (SPEC §6.3).
   *
   * 점수 집계도 같이 넣어야 한다 — R2 진출은 승패가 아니라 **R1 점수 순위 상위 4팀**이라
   * (drawRound2 → topTeamsForRound), scoreSummary 없이 공개하면 순위가 비어서 추첨이
   * ROUND1_INCOMPLETE 로 거부된다. 즉 이게 없으면 r1-done 이후 시점으로는 점프 자체가 안 됐다.
   * 경기마다 다른 값을 줘서 동점 없이 순위가 확정되게 한다.
   */
  const winA = (id: string, nth: number) => {
    s = startMatch(s, id);
    s = revealResult(s, id, 'A', [], [], { A: 90 - nth, B: 20 - nth });
  };
  if (stage === 'pre') return s;
  if (stage === 'r1-live') return startMatch(s, 'R1-1');
  ROUND1_IDS.forEach((id, i) => winA(id, i));
  if (stage === 'r1-done') return s;
  s = drawRound2(s, rng);
  if (stage === 'drawn') return s;
  ROUND2_IDS.forEach((id, i) => winA(id, i));
  if (stage === 'r2-done') return s;
  s = setFinal(s);
  s = startMatch(s, FINAL_ID);
  if (stage === 'final-live') return s;
  return revealResult(s, FINAL_ID, 'A', [], [], { A: 90, B: 20 });
}
