#!/usr/bin/env node
// 서버를 데모/캡처용 장면 상태로 세팅 — Figma Code to Canvas 캡처, 리허설 준비용.
//
//   node scripts/scene.mjs <장면> [--base <URL>] [--pin <PIN>]
//
//   장면:
//     empty    빈 브래킷 (팀 미입력)
//     teams    팀 8 + 심사위원 5 등록, 전 경기 대기
//     focus    R1-1 LIVE + 표 4건(3:1) — 대결 포커스 화면
//     bracket  R1 종료 + R2 추첨 완료 — 연결선 실선 브래킷
//     champion 결선까지 완주 — 우승 테이크오버
//     demo     R1-1 종료(5표 3:2) + R1-2 LIVE(4표) — 체험용 기본
//
//   예: node scripts/scene.mjs bracket --base https://animal-league-nine.vercel.app
//
// 표 오픈 시퀀스는 공개 '순간'의 연출이라 정지 상태로 만들 수 없다 —
// focus 장면에서 운영 화면의 공개 버튼을 눌러 재생 중에 캡처할 것.
// ⚠️ 실행하면 기존 브래킷·표가 초기화된다 (명단·코드·PIN 은 유지).

const args = process.argv.slice(2);
const scene = args.find((a) => !a.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = opt('base', 'http://localhost:3000');
const PIN = opt('pin', process.env.ADMIN_PIN ?? '0825');

const SCENES = ['empty', 'teams', 'focus', 'bracket', 'champion', 'demo'];
if (!scene || !SCENES.includes(scene)) {
  console.error(`사용법: node scripts/scene.mjs <${SCENES.join('|')}> [--base URL] [--pin PIN]`);
  process.exit(1);
}

const TEAMS = [
  ['서울대학교', '멋쟁이사자들', 'SJF', 'char_72'],
  ['연세대학교(서울)', '푸른독수리', 'SJF', 'char_62'],
  ['고려대학교(서울)', '호랑이기운', 'AAC', 'char_11'],
  ['한양대학교(ERICA)', '사자후', 'AAC', 'char_63'],
  ['성균관대학교', '유생들', 'LIKELION', 'char_34'],
  ['서강대학교', '알바트로스', 'LIKELION', 'char_49'],
  ['이화여자대학교', '배꽃컴퍼니', 'OPEN', 'char_44'],
  ['숙명여자대학교', '눈송이', 'OPEN', 'char_13'],
];
const JUDGES = ['김멋사', '이택견', '박호랑', '최독수리', '정카피바라'];

const login = await fetch(`${BASE}/api/admin/auth`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ pin: PIN }),
});
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!(await login.json()).ok || !cookie) {
  console.error('로그인 실패 — --pin 으로 현재 PIN 을 넘기세요.');
  process.exit(1);
}

const act = async (payload, ignore = []) => {
  const res = await fetch(`${BASE}/api/admin/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (!body.ok && !ignore.includes(body.error?.code)) {
    throw new Error(`${payload.action}: ${body.error?.message}`);
  }
};
const vote = async (matchId, name, winner, comment) => {
  const res = await fetch(`${BASE}/api/vote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: opt('code', 'ANIMAL'), matchId, name, winner, comment }),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(`vote: ${body.error?.message}`);
};

const seedTeams = async () => {
  for (let i = 0; i < 8; i += 1) {
    const [school, team, track, character] = TEAMS[i];
    await act({ action: 'updateTeam', index: i, patch: { school, team, track, character } });
  }
  for (const j of JUDGES) await act({ action: 'addJudge', name: j }, ['JUDGE_DUPLICATE']);
};
const play = async (id, winner) => {
  await act({ action: 'startMatch', matchId: id });
  await act({ action: 'revealResult', matchId: id, winner });
};

await act({ action: 'reset', clearTeams: scene === 'empty' });

if (scene !== 'empty') await seedTeams();

if (scene === 'focus') {
  await act({ action: 'startMatch', matchId: 'R1-1' });
  await vote('R1-1', '김멋사', 'A', '기획 완성도가 높습니다.');
  await vote('R1-1', '이택견', 'A');
  await vote('R1-1', '박호랑', 'B', '기술 난도는 이쪽이 위.');
  await vote('R1-1', '최독수리', 'A');
}

if (scene === 'bracket' || scene === 'champion') {
  for (const [id, w] of [['R1-1', 'A'], ['R1-2', 'B'], ['R1-3', 'A'], ['R1-4', 'B']]) await play(id, w);
  await act({ action: 'drawRound2' });
}

if (scene === 'champion') {
  await play('R2-1', 'A');
  await play('R2-2', 'A');
  await act({ action: 'setFinal' });
  await play('F', 'A');
}

if (scene === 'demo') {
  await act({ action: 'startMatch', matchId: 'R1-1' });
  await vote('R1-1', '김멋사', 'A', '기획 완성도가 높습니다.');
  await vote('R1-1', '이택견', 'A');
  await vote('R1-1', '박호랑', 'B', '기술 난도는 이쪽이 위.');
  await vote('R1-1', '최독수리', 'A');
  await vote('R1-1', '정카피바라', 'B');
  await act({ action: 'revealResult', matchId: 'R1-1', winner: 'A' });
  await act({ action: 'startMatch', matchId: 'R1-2' });
  await vote('R1-2', '김멋사', 'A', '시장 조사가 탄탄해요.');
  await vote('R1-2', '이택견', 'B');
  await vote('R1-2', '박호랑', 'A', 'UI 디테일이 좋았습니다.');
  await vote('R1-2', '최독수리', 'A');
}

console.log(`장면 세팅 완료: ${scene} (${BASE})`);
