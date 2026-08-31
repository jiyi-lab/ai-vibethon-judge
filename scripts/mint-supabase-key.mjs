// vibethon_app 전용 Supabase API 키 발급 (2026-08-31)
//
// 이 앱은 무료 플랜 프로젝트 한도(계정당 활성 2개) 때문에 **다른 용도로 쓰던 기존
// Supabase 프로젝트에 얹혀 산다**. 그래서 service_role 키를 쓰면 안 된다 —
// 그건 그 프로젝트 DB 전체의 마스터 키라, 행사 앱이 뚫리면 호스트 프로젝트
// 데이터까지 함께 열린다.
//
// 대신 supabase/schema.sql 이 만든 `vibethon_app` role 로 붙는다. PostgREST 는
// JWT 의 `role` 클레임을 보고 그 role 로 SET ROLE 하므로, 그 클레임을 담은 토큰을
// 프로젝트 JWT 시크릿으로 서명해 주면 그게 곧 API 키가 된다.
// 이 키가 유출돼도 vibethon 스키마 밖으로는 아무것도 못 한다.
//
// ── 쓰는 법 ────────────────────────────────────────────────
//   1. Supabase 대시보드 > Settings > API > JWT Settings 에서 **JWT Secret** 복사
//   2. 아래처럼 환경변수로 넘겨 실행 (셸 히스토리에 남지 않게 앞에 공백 한 칸)
//
//        SUPABASE_JWT_SECRET='...' node scripts/mint-supabase-key.mjs --ref <project-ref>
//
//   3. 출력된 토큰을 Vercel 환경변수 SUPABASE_VIBETHON_KEY 에 등록
//
// ⚠️ JWT 시크릿을 jwt.io 같은 웹사이트에 붙여넣지 말 것. 그 자체가 유출이다.
//    이 스크립트는 로컬에서만 돌고 아무 데도 전송하지 않는다 (crypto 표준 모듈만 사용).
// ⚠️ 시크릿을 인자로 넘기지 말 것 (`--secret ...`) — ps 목록과 셸 히스토리에 남는다.

import { createHmac } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const secret = process.env.SUPABASE_JWT_SECRET;
if (!secret) {
  console.error(
    [
      'SUPABASE_JWT_SECRET 이 없습니다.',
      '',
      "  SUPABASE_JWT_SECRET='...' node scripts/mint-supabase-key.mjs --ref <project-ref>",
      '',
      '시크릿은 Supabase 대시보드 > Settings > API > JWT Settings 의 JWT Secret 입니다.',
      '프로젝트가 새 비대칭 서명 키만 쓰고 있어 이 항목이 안 보이면, 같은 화면에서',
      'legacy JWT secret 을 켜거나 README 의 대체 경로(service_role)를 따르세요.',
    ].join('\n'),
  );
  process.exit(1);
}

const role = flag('role', 'vibethon_app');
const ref = flag('ref'); // 프로젝트 ref (URL 의 <ref>.supabase.co). 없으면 클레임에서 생략
const years = Number(flag('years', '3'));
if (!Number.isFinite(years) || years <= 0) {
  console.error('--years 는 양수여야 합니다.');
  process.exit(1);
}

const b64url = (input) =>
  Buffer.from(input).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'HS256', typ: 'JWT' };
const payload = {
  role,
  iss: 'supabase',
  ...(ref ? { ref } : {}),
  iat: now,
  exp: now + Math.round(years * 365 * 24 * 60 * 60),
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const signature = createHmac('sha256', secret)
  .update(signingInput)
  .digest('base64')
  .replaceAll('+', '-')
  .replaceAll('/', '_')
  .replaceAll('=', '');

const expiresOn = new Date(payload.exp * 1000).toISOString().slice(0, 10);

console.log(`${signingInput}.${signature}`);
console.error(''); // 토큰만 파이프로 넘길 수 있게 안내는 stderr 로
console.error(`role=${role}${ref ? ` ref=${ref}` : ''} 만료=${expiresOn} (${years}년)`);
console.error('위 토큰을 SUPABASE_VIBETHON_KEY 로 등록하세요. 서버에서만 쓰이며 브라우저로 내려가지 않습니다.');
