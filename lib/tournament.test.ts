// 브래킷 로직 단위 테스트 — `npm test` (Node 24 내장 러너, 의존성 없음).
//
// 가드가 곧 당일 사고 방지선이라 정상 경로보다 거부 경로를 촘촘히 본다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addJudge,
  announceResult,
  createInitialState,
  drawRound2,
  finalRevealOrder,
  isAnnounced,
  findJudge,
  getMatch,
  judgeSlug,
  judgeRevealOrder,
  removeJudge,
  liveMatch,
  matchesJudgeCode,
  reset,
  revealResult,
  seekStage,
  setFinal,
  setTimer,
  shuffle,
  startMatch,
  TIMER_PRESETS,
  trackWarnings,
  updateTeam,
  winningTeamId,
  champion,
  canDrawRound2,
  canSetFinal,
  ROUND1_IDS,
  ROUND2_IDS,
  TournamentError,
  type MatchId,
  type Side,
  type TournamentState,
} from './tournament.ts';

// ------------------------------------------------------------
// 도우미
// ------------------------------------------------------------

/** 미리 정한 값을 차례로 뱉는 rng. 다 쓰면 0 으로 고정. */
function fixedRng(values: number[]) {
  let i = 0;
  return () => values[i++] ?? 0;
}

/** 8팀을 트랙별 2팀씩 인접 배치한 상태 (규정상 R1 대진 모양). */
function seeded(): TournamentState {
  const tracks = ['SJF', 'SJF', 'AAC', 'AAC', 'LIKELION', 'LIKELION', 'OPEN', 'OPEN'] as const;
  return createInitialState({
    teams: tracks.map((track, i) => ({
      character: `char_0${i + 1}`,
      school: `${i + 1}대`,
      team: `팀${i + 1}`,
      track,
    })),
  });
}

/** 경기를 시작하고 한쪽 승리로 공개까지. */
function play(state: TournamentState, matchId: MatchId, winner: Side): TournamentState {
  return revealResult(startMatch(state, matchId), matchId, winner);
}

/** R1 4경기를 전부 A 승으로 끝낸 상태 → 승자는 팀 0, 2, 4, 6. */
function afterRound1(): TournamentState {
  return ROUND1_IDS.reduce((s, id) => play(s, id, 'A'), seeded());
}

function expectError(code: string, fn: () => unknown) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof TournamentError, `TournamentError 가 아님: ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

// ------------------------------------------------------------
// 초기 상태
// ------------------------------------------------------------

test('초기 상태는 8팀 7경기, R1 대진은 인접 쌍', () => {
  const s = createInitialState();

  assert.equal(s.teams.length, 8);
  assert.equal(s.matches.length, 7);
  assert.deepEqual(
    s.matches.map((m) => m.id),
    ['R1-1', 'R1-2', 'R1-3', 'R1-4', 'R2-1', 'R2-2', 'F'],
  );
  assert.deepEqual(
    s.matches.filter((m) => m.round === 1).map((m) => [m.a, m.b]),
    [[0, 1], [2, 3], [4, 5], [6, 7]],
  );

  // 상위 라운드는 추첨/확정 전까지 빈 슬롯
  for (const id of [...ROUND2_IDS, 'F'] as MatchId[]) {
    const m = getMatch(s, id);
    assert.equal(m.a, null);
    assert.equal(m.b, null);
  }
  assert.ok(s.matches.every((m) => m.status === 'ready' && m.winner === null));
});

test('팀 슬롯은 서로 다른 객체 — 하나를 고쳐도 나머지가 따라 바뀌지 않는다', () => {
  const s = createInitialState();
  const next = updateTeam(s, 0, { team: '가' });

  assert.equal(next.teams[0].team, '가');
  assert.equal(next.teams[1].team, '2팀');
});

// ------------------------------------------------------------
// 경기 시작
// ------------------------------------------------------------

test('경기 시작하면 live 로 바뀐다', () => {
  const s = startMatch(seeded(), 'R1-1');

  assert.equal(getMatch(s, 'R1-1').status, 'live');
  assert.equal(liveMatch(s)?.id, 'R1-1');
});

test('다른 경기를 시작하면 기존 live 는 ready 로 되돌아간다', () => {
  const s = startMatch(startMatch(seeded(), 'R1-1'), 'R1-2');

  assert.equal(getMatch(s, 'R1-1').status, 'ready');
  assert.equal(getMatch(s, 'R1-2').status, 'live');
  assert.equal(s.matches.filter((m) => m.status === 'live').length, 1);
});

test('대진 미확정 경기는 시작할 수 없다', () => {
  expectError('BRACKET_UNRESOLVED', () => startMatch(seeded(), 'R2-1'));
  expectError('BRACKET_UNRESOLVED', () => startMatch(seeded(), 'F'));
});

test('이미 공개된 경기는 다시 시작할 수 없다', () => {
  const s = play(seeded(), 'R1-1', 'A');
  expectError('ALREADY_DONE', () => startMatch(s, 'R1-1'));
});

test('없는 경기 ID 는 거부', () => {
  expectError('MATCH_NOT_FOUND', () => startMatch(seeded(), 'R3-9'));
});

test('전이는 입력 상태를 건드리지 않는다 — mutate 재시도가 같은 변형을 다시 적용할 수 있어야 한다', () => {
  const before = seeded();
  const snapshot = structuredClone(before);

  startMatch(before, 'R1-1');
  play(before, 'R1-2', 'B');
  updateTeam(before, 3, { team: '바뀜' });

  assert.deepEqual(before, snapshot);
});

// ------------------------------------------------------------
// 결과 공개
// ------------------------------------------------------------

test('결과 공개하면 done + 승자 기록', () => {
  const s = play(seeded(), 'R1-2', 'B');
  const m = getMatch(s, 'R1-2');

  assert.equal(m.status, 'done');
  assert.equal(m.winner, 'B');
  assert.equal(winningTeamId(m), 3);
  assert.equal(liveMatch(s), null);
});

test('심사 제출이 0건이어도 공개된다 — 백업 모드 (SPEC §5)', () => {
  // 이 모듈은 표를 판정에 쓰지 않는다. 시작 → 공개만으로 끝나는 것 자체가 보장선.
  const s = play(seeded(), 'R1-1', 'A');
  assert.equal(getMatch(s, 'R1-1').status, 'done');
  assert.deepEqual(getMatch(s, 'R1-1').votes, []); // 표 없음 → 스크린은 연출 생략
});

test('공개 시 익명 표가 함께 저장된다 (스크린 투표 오픈 연출, §6.1)', () => {
  const s = revealResult(startMatch(seeded(), 'R1-1'), 'R1-1', 'A', ['A', 'B', 'A', 'A', 'B']);
  const m = getMatch(s, 'R1-1');

  assert.deepEqual(m.votes, ['A', 'B', 'A', 'A', 'B']);
  // 공개 전 경기는 votes 가 비어 있어야 한다 — 진행 중 유출 방지
  assert.equal(getMatch(s, 'R1-2').votes, null);
});

test('초기화하면 저장된 표도 사라진다', () => {
  const s = revealResult(startMatch(seeded(), 'R1-1'), 'R1-1', 'A', ['A', 'A', 'B']);
  assert.ok(reset(s).matches.every((m) => m.votes === null));
});

test('시작하지 않은 경기는 공개할 수 없다', () => {
  expectError('NOT_LIVE', () => revealResult(seeded(), 'R1-1', 'A'));
});

test('결과 취소는 없다 — done 은 종착 상태라 재공개도 거부', () => {
  const s = play(seeded(), 'R1-1', 'A');
  expectError('ALREADY_DONE', () => revealResult(s, 'R1-1', 'B'));
});

// ------------------------------------------------------------
// 라운드 2 추첨
// ------------------------------------------------------------

test('R1 이 끝나기 전에는 추첨할 수 없다', () => {
  let s = seeded();
  assert.equal(canDrawRound2(s), false);
  expectError('ROUND1_INCOMPLETE', () => drawRound2(s));

  s = play(s, 'R1-1', 'A');
  s = play(s, 'R1-2', 'A');
  s = play(s, 'R1-3', 'A');
  assert.equal(canDrawRound2(s), false);
  expectError('ROUND1_INCOMPLETE', () => drawRound2(s));
});

test('추첨은 R1 승자 4팀을 빠짐없이 한 번씩 배치한다', () => {
  const s = drawRound2(afterRound1(), fixedRng([0.9, 0.1, 0.5]));
  const placed = ROUND2_IDS.flatMap((id) => {
    const m = getMatch(s, id);
    return [m.a, m.b];
  });

  assert.equal(canDrawRound2(afterRound1()), true);
  assert.deepEqual([...placed].sort(), [0, 2, 4, 6]);
});

test('추첨 결과는 rng 에 따라 달라진다 — 고정 순서가 아니다', () => {
  const base = afterRound1();
  const layout = (rng: () => number) =>
    ROUND2_IDS.flatMap((id) => {
      const m = getMatch(drawRound2(base, rng), id);
      return [m.a, m.b];
    });

  assert.notDeepEqual(layout(fixedRng([0, 0, 0])), layout(fixedRng([0.99, 0.99, 0.99])));
});

test('추첨은 두 번 할 수 없다', () => {
  const s = drawRound2(afterRound1());
  assert.equal(canDrawRound2(s), false);
  expectError('ALREADY_DRAWN', () => drawRound2(s));
});

test('추첨 뒤에는 R2 경기를 시작할 수 있다', () => {
  const s = startMatch(drawRound2(afterRound1()), 'R2-1');
  assert.equal(getMatch(s, 'R2-1').status, 'live');
});

// ------------------------------------------------------------
// 결선
// ------------------------------------------------------------

test('R2 가 끝나야 결선을 확정할 수 있다', () => {
  const s = drawRound2(afterRound1());
  assert.equal(canSetFinal(s), false);
  expectError('ROUND2_INCOMPLETE', () => setFinal(s));

  const half = play(s, 'R2-1', 'A');
  expectError('ROUND2_INCOMPLETE', () => setFinal(half));
});

test('결선 대진은 R2 두 경기의 승자 (추첨 없음)', () => {
  let s = drawRound2(afterRound1(), fixedRng([0.4, 0.7, 0.2]));
  s = play(s, 'R2-1', 'B');
  s = play(s, 'R2-2', 'A');

  assert.equal(canSetFinal(s), true);
  const withFinal = setFinal(s);
  const f = getMatch(withFinal, 'F');

  assert.equal(f.a, getMatch(s, 'R2-1').b);
  assert.equal(f.b, getMatch(s, 'R2-2').a);
  assert.equal(canSetFinal(withFinal), false);
  expectError('FINAL_ALREADY_SET', () => setFinal(withFinal));
});

test('결선 공개 전까지 우승팀은 없다', () => {
  let s = drawRound2(afterRound1());
  s = play(s, 'R2-1', 'A');
  s = play(s, 'R2-2', 'A');
  s = setFinal(s);

  assert.equal(champion(s), null);

  const done = play(s, 'F', 'B');
  assert.equal(champion(done), getMatch(done, 'F').b);
});

// ------------------------------------------------------------
// 셔플
// ------------------------------------------------------------

test('셔플은 입력을 건드리지 않고 원소를 보존한다', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(input, fixedRng([0.3, 0.8, 0.1, 0.6, 0.4, 0.9, 0.2]));

  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...out].sort((x, y) => x - y), input);
});

test('셔플은 네 원소의 순열을 골고루 만든다', () => {
  // Fisher–Yates 가 제자리에서 인덱스를 잘못 다루면 특정 순열이 아예 안 나온다.
  let seed = 12345;
  const lcg = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  const seen = new Set<string>();
  for (let i = 0; i < 400; i += 1) seen.add(shuffle([0, 1, 2, 3], lcg).join(''));

  assert.equal(seen.size, 24);
});

// ------------------------------------------------------------
// 팀 관리 · 설정
// ------------------------------------------------------------

test('팀 인덱스와 트랙을 검증한다', () => {
  const s = seeded();

  expectError('INVALID_TEAM_INDEX', () => updateTeam(s, 8, { team: '가' }));
  expectError('INVALID_TEAM_INDEX', () => updateTeam(s, -1, { team: '가' }));
  // @ts-expect-error 런타임 방어 — API 로 들어온 문자열은 타입이 지켜주지 않는다
  expectError('INVALID_TRACK', () => updateTeam(s, 0, { track: 'SJFF' }));
});

test('R1 인접 쌍의 트랙이 어긋나면 경고한다 (막지는 않는다)', () => {
  assert.deepEqual(trackWarnings(seeded()), []);

  const mixed = updateTeam(seeded(), 1, { track: 'OPEN' });
  assert.deepEqual(trackWarnings(mixed), ['R1-1']);
});

test('심사 코드는 대소문자·앞뒤 공백을 무시하고 대조한다', () => {
  const s = createInitialState({ judgeCode: 'Animal' });

  assert.equal(matchesJudgeCode(s, 'animal'), true);
  assert.equal(matchesJudgeCode(s, '  ANIMAL '), true);
  assert.equal(matchesJudgeCode(s, 'anima'), false);
});

// ------------------------------------------------------------
// 심사위원 명단
// ------------------------------------------------------------

test('명의 키는 공백·대소문자·유니코드 표기 차이를 무시한다', () => {
  assert.equal(judgeSlug('김 심사'), judgeSlug('김심사'));
  assert.equal(judgeSlug('Kim Judge'), judgeSlug('kimjudge'));
  // NFD(자모 분해)로 들어와도 NFC 와 같은 키
  assert.equal(judgeSlug('김심사'.normalize('NFD')), judgeSlug('김심사'));
});

test('명단 등록·조회·삭제', () => {
  let s = addJudge(createInitialState(), '김심사');
  s = addJudge(s, '이심사');

  assert.deepEqual(s.judges, ['김심사', '이심사']);
  assert.equal(findJudge(s, '김 심사'), '김심사'); // 표기 흔들림에도 등록명 반환
  assert.equal(findJudge(s, '박심사'), null);

  s = removeJudge(s, '김 심사');
  assert.deepEqual(s.judges, ['이심사']);
});

test('중복 명의·없는 명의·빈 이름은 거부', () => {
  const s = addJudge(createInitialState(), '김심사');

  expectError('JUDGE_DUPLICATE', () => addJudge(s, '김 심사'));
  expectError('JUDGE_NOT_FOUND', () => removeJudge(s, '박심사'));
  expectError('INVALID_JUDGE_NAME', () => addJudge(s, '  '));
  expectError('INVALID_JUDGE_NAME', () => addJudge(s, '가'.repeat(31)));
});

test('초기화해도 심사위원 명단은 유지된다', () => {
  let s = addJudge(seeded(), '김심사');
  s = play(s, 'R1-1', 'A');

  assert.deepEqual(reset(s).judges, ['김심사']);
  assert.deepEqual(reset(s, { clearTeams: true }).judges, ['김심사']);
});

// ------------------------------------------------------------
// 초기화
// ------------------------------------------------------------

test('초기화는 진행 상황만 지우고 코드·PIN 은 유지한다', () => {
  let s = createInitialState({ judgeCode: 'ZEBRA', adminPin: '9999', teams: seeded().teams });
  s = play(s, 'R1-1', 'A');
  s = play(s, 'R1-2', 'A');
  s = startMatch(s, 'R1-3');

  const cleared = reset(s);

  assert.equal(cleared.judgeCode, 'ZEBRA');
  assert.equal(cleared.adminPin, '9999');
  assert.deepEqual(cleared.teams, s.teams);
  assert.ok(cleared.matches.every((m) => m.status === 'ready' && m.winner === null));
  assert.equal(getMatch(cleared, 'R2-1').a, null);
});

test('리허설 더미 팀은 clearTeams 로 비운다', () => {
  const cleared = reset(seeded(), { clearTeams: true });

  assert.ok(cleared.teams.every((t) => t.team === '' && t.school === '' && t.character === null));
  assert.equal(cleared.teams.length, 8);
});

// ------------------------------------------------------------
// 라운드 타이머 (§6.2 개정 8/19 — 운영 구동 서버 동기)
// ------------------------------------------------------------

test('경기 시작 시 해당 라운드 첫 프리셋 타이머가 자동 시작된다', () => {
  const s = startMatch(seeded(), 'R1-1', 1000);
  assert.deepEqual(s.timer, { matchId: 'R1-1', label: '발표', seconds: 300, startedAt: 1000 });
});

test('다른 경기를 시작하면 타이머도 새 경기로 교체된다', () => {
  let s = startMatch(seeded(), 'R1-1', 1000);
  s = startMatch(s, 'R1-2', 2000);
  assert.equal(s.timer?.matchId, 'R1-2');
  assert.equal(s.timer?.startedAt, 2000);
});

test('결과 공개와 함께 타이머가 해제된다', () => {
  let s = startMatch(seeded(), 'R1-1', 1000);
  s = revealResult(s, 'R1-1', 'A');
  assert.equal(s.timer, null);
});

test('setTimer: 단계 전환은 live 라운드의 프리셋만 허용한다', () => {
  const s = startMatch(seeded(), 'R1-1', 1000);
  const next = setTimer(s, '공통 Q&A', 5000);
  assert.deepEqual(next.timer, { matchId: 'R1-1', label: '공통 Q&A', seconds: 480, startedAt: 5000 });
  // R1 에 없는 단계(R2 프리셋)는 거부
  expectError('INVALID_TIMER_LABEL', () => setTimer(s, '시연'));
});

test('setTimer: 같은 단계를 다시 누르면 지금부터 재시작된다', () => {
  const s = startMatch(seeded(), 'R1-1', 1000);
  const restarted = setTimer(s, '발표', 90_000);
  assert.equal(restarted.timer?.startedAt, 90_000);
  assert.equal(restarted.timer?.seconds, TIMER_PRESETS[1][0].seconds);
});

test('setTimer: 진행 중 경기가 없으면 거부한다', () => {
  expectError('NOT_LIVE', () => setTimer(seeded(), '발표'));
});

test('초기화하면 타이머도 해제된다', () => {
  const s = startMatch(seeded(), 'R1-1', 1000);
  assert.equal(reset(s).timer, null);
});

// ------------------------------------------------------------
// 2단계 공개 (8/22) — announceResult / isAnnounced
// ------------------------------------------------------------

test('발표 확정: done 전에는 거부한다', () => {
  expectError('NOT_DONE', () => announceResult(seeded(), 'R1-1'));
  const live = startMatch(seeded(), 'R1-1');
  expectError('NOT_DONE', () => announceResult(live, 'R1-1'));
});

test('발표 확정: 표 있는 공개 → announce 후에만 isAnnounced', () => {
  let s = startMatch(seeded(), 'R1-1');
  s = revealResult(s, 'R1-1', 'A', ['A', 'B', 'A']);
  assert.equal(isAnnounced(getMatch(s, 'R1-1')), false); // 카드 정지 화면 단계
  s = announceResult(s, 'R1-1');
  assert.equal(isAnnounced(getMatch(s, 'R1-1')), true);
  expectError('ALREADY_ANNOUNCED', () => announceResult(s, 'R1-1'));
});

test('발표 확정: 표 0건(백업 모드)은 정지 화면 없이 즉시 발표로 친다', () => {
  let s = startMatch(seeded(), 'R1-1');
  s = revealResult(s, 'R1-1', 'A');
  assert.equal(isAnnounced(getMatch(s, 'R1-1')), true);
  expectError('ALREADY_ANNOUNCED', () => announceResult(s, 'R1-1'));
});

// ------------------------------------------------------------
// 결선 표 공개 순서 (8/22) — finalRevealOrder
// ------------------------------------------------------------

test('결선 순서: 3:2 는 패승패승승 — 마지막 장이 승부를 확정한다', () => {
  assert.deepEqual(finalRevealOrder(['A', 'A', 'B', 'A', 'B'], 'A'), ['B', 'A', 'B', 'A', 'A']);
});

test('결선 순서: 압도(4:1/5:0)면 표 적은 쪽 먼저', () => {
  assert.deepEqual(finalRevealOrder(['A', 'A', 'A', 'B', 'A'], 'A'), ['B', 'A', 'A', 'A', 'A']);
  assert.deepEqual(finalRevealOrder(['A', 'A', 'A', 'A', 'A'], 'A'), ['A', 'A', 'A', 'A', 'A']);
});

test('결선 순서: 승자가 B 여도 같은 규칙', () => {
  assert.deepEqual(finalRevealOrder(['B', 'A', 'B', 'B', 'A'], 'B'), ['A', 'B', 'A', 'B', 'B']);
});

test('결선 순서: {표, 명의} 쌍도 쌍이 깨지지 않고 같은 규칙으로 재배열된다 (8/22 저녁 명의 표기)', () => {
  const pairs = [
    { w: 'A' as const, name: '김' },
    { w: 'A' as const, name: '이' },
    { w: 'B' as const, name: '박' },
    { w: 'A' as const, name: '최' },
    { w: 'B' as const, name: '정' },
  ];
  assert.deepEqual(
    finalRevealOrder(pairs, 'A', (p) => p.w),
    [
      { w: 'B', name: '박' },
      { w: 'A', name: '김' },
      { w: 'B', name: '정' },
      { w: 'A', name: '이' },
      { w: 'A', name: '최' },
    ],
  );
});

// ------------------------------------------------------------
// R1·R2 표 공개 순서 (8/25) — judgeRevealOrder (셔플 대체, 결선은 finalRevealOrder 유지)
// ------------------------------------------------------------

const jPairs = (...ws: [string, 'A' | 'B'][]) => ws.map(([name, w]) => ({ name, w }));

test('R1·R2 순서: 제출 순서가 아니라 운영 콘솔 명단 순서로 깔린다', () => {
  const judges = ['김', '이', '박', '최', '정'];
  // 제출은 정 → 박 → 김 → 최 → 이 순으로 들어왔다 (votesForMatch 는 ts 오름차순)
  const submitted = jPairs(['정', 'A'], ['박', 'B'], ['김', 'A'], ['최', 'B'], ['이', 'A']);
  assert.deepEqual(
    judgeRevealOrder(submitted, judges, (p) => p.name).map((p) => p.name),
    judges,
  );
});

test('R1·R2 순서: 표와 명의 쌍이 깨지지 않는다', () => {
  const submitted = jPairs(['박', 'B'], ['김', 'A'], ['이', 'A']);
  assert.deepEqual(judgeRevealOrder(submitted, ['김', '이', '박'], (p) => p.name), [
    { name: '김', w: 'A' },
    { name: '이', w: 'A' },
    { name: '박', w: 'B' },
  ]);
});

test('R1·R2 순서: 명의 대조는 judgeSlug 기준 — 공백·대소문자 차이를 넘는다', () => {
  const submitted = jPairs(['kim  lee', 'A'], ['박', 'B']);
  assert.deepEqual(
    judgeRevealOrder(submitted, ['박', 'KimLee'], (p) => p.name).map((p) => p.name),
    ['박', 'kim  lee'],
  );
});

test('R1·R2 순서: 명단에 없는 명의(제출 뒤 삭제)는 버리지 않고 뒤로, 서로의 순서는 유지', () => {
  // 카드를 빼면 집계 숫자와 카드 수가 어긋난다 — 표는 그대로 두고 순서만 민다
  const submitted = jPairs(['정', 'A'], ['이', 'B'], ['한', 'A'], ['김', 'A']);
  assert.deepEqual(
    judgeRevealOrder(submitted, ['김', '이'], (p) => p.name).map((p) => p.name),
    ['김', '이', '정', '한'],
  );
});

test('R1·R2 순서: 명단이 비어 있으면(백업 모드) 넘겨받은 순서 그대로', () => {
  const submitted = jPairs(['정', 'A'], ['김', 'B']);
  assert.deepEqual(
    judgeRevealOrder(submitted, [], (p) => p.name).map((p) => p.name),
    ['정', '김'],
  );
});

test('R1·R2 순서: 입력 배열을 건드리지 않는다 (mutate 재시도 안에서 도는 순수 함수)', () => {
  const submitted = jPairs(['정', 'A'], ['김', 'B']);
  judgeRevealOrder(submitted, ['김', '정'], (p) => p.name);
  assert.deepEqual(submitted.map((p) => p.name), ['정', '김']);
});

test('공개: voteNames 가 votes 와 같은 순서로 저장된다 (정지 화면 명의 표기)', () => {
  const s = revealResult(startMatch(seeded(), 'R1-1'), 'R1-1', 'A', ['A', 'B', 'A'], ['김', '박', '이']);
  assert.deepEqual(getMatch(s, 'R1-1').votes, ['A', 'B', 'A']);
  assert.deepEqual(getMatch(s, 'R1-1').voteNames, ['김', '박', '이']);
});

test('결선 특례: 공개 즉시 발표 간주 — 표가 있어도 announced, 재발표는 거부 (8/22 큐시트)', () => {
  let s = drawRound2(afterRound1());
  s = play(s, 'R2-1', 'A');
  s = play(s, 'R2-2', 'A');
  s = setFinal(s);
  s = revealResult(startMatch(s, 'F'), 'F', 'A', ['A', 'B', 'A', 'A', 'B'], ['김', '박', '이', '최', '정']);

  assert.equal(getMatch(s, 'F').announced, true);
  assert.equal(isAnnounced(getMatch(s, 'F')), true);
  expectError('ALREADY_ANNOUNCED', () => announceResult(s, 'F'));
  // R1·R2 는 특례가 아니다 — 여전히 2단계
  assert.equal(isAnnounced(getMatch(play(seeded(), 'R1-1', 'A'), 'R1-1')), true); // 표 0건 백업만 즉시
  const r1 = revealResult(startMatch(seeded(), 'R1-1'), 'R1-1', 'A', ['A']);
  assert.equal(isAnnounced(getMatch(r1, 'R1-1')), false);
});

// ------------------------------------------------------------
// 수동 대진 (8/22) — drawRound2 pairs
// ------------------------------------------------------------

test('수동 대진: 지정한 짝이 그대로 들어간다', () => {
  const base = afterRound1(); // R1 승자 = 0, 2, 4, 6 (전부 A 승)
  const s = drawRound2(base, Math.random, [
    [0, 4],
    [2, 6],
  ]);
  assert.deepEqual([getMatch(s, 'R2-1').a, getMatch(s, 'R2-1').b], [0, 4]);
  assert.deepEqual([getMatch(s, 'R2-2').a, getMatch(s, 'R2-2').b], [2, 6]);
});

test('수동 대진: 승자 아님·중복은 거부한다', () => {
  const base = afterRound1();
  expectError('INVALID_PAIRS', () => drawRound2(base, Math.random, [[0, 1], [2, 6]])); // 1 은 패자
  expectError('INVALID_PAIRS', () => drawRound2(base, Math.random, [[0, 0], [2, 6]])); // 중복
});

// ------------------------------------------------------------
// 리허설 점프 (8/24) — seekStage
// ------------------------------------------------------------

test('리허설 점프: 각 시점의 상태 형태가 맞다', () => {
  const base = afterRound1(); // 아무 진행 상태에서 출발해도 된다
  const judges = [...base.judges];

  const pre = seekStage(base, 'pre');
  assert.equal(pre.matches.every((m) => m.status === 'ready' && m.winner === null), true);
  assert.deepEqual(pre.judges, judges); // 명단 유지

  const r1live = seekStage(base, 'r1-live');
  assert.equal(liveMatch(r1live)?.id, 'R1-1');

  const r1done = seekStage(base, 'r1-done');
  assert.equal(['R1-1', 'R1-2', 'R1-3', 'R1-4'].every((id) => getMatch(r1done, id).status === 'done'), true);
  assert.equal(getMatch(r1done, 'R2-1').a, null); // 추첨 전

  const drawn = seekStage(base, 'drawn');
  assert.notEqual(getMatch(drawn, 'R2-1').a, null);
  assert.notEqual(getMatch(drawn, 'R2-2').b, null);

  const r2done = seekStage(base, 'r2-done');
  assert.equal(['R2-1', 'R2-2'].every((id) => getMatch(r2done, id).status === 'done'), true);
  assert.equal(getMatch(r2done, 'F').a, null); // 결선 확정 전

  const finalLive = seekStage(base, 'final-live');
  assert.equal(liveMatch(finalLive)?.id, 'F');

  const champ = seekStage(base, 'champion');
  assert.equal(isAnnounced(getMatch(champ, 'F')), true); // 결선 특례 — 공개 즉시 발표
});

test('리허설 점프: 표는 항상 0건으로 지나간다 (즉시 발표 간주)', () => {
  const s = seekStage(createInitialState(), 'r1-done');
  assert.equal(s.matches.filter((m) => m.status === 'done').every((m) => (m.votes ?? []).length === 0), true);
  assert.equal(['R1-1', 'R1-2', 'R1-3', 'R1-4'].every((id) => isAnnounced(getMatch(s, id))), true);
});
