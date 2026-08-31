// 운영 세션 인증 — PIN 원문을 쿠키에 넣지 않는 파생 토큰 방식.
//
// 로그인 시 PIN 을 서버 비밀키로 HMAC 한 값을 쿠키로 내려주고,
// 이후 요청은 현재 PIN 으로 같은 토큰을 다시 만들어 대조한다.
// - 쿠키가 새어도 PIN 원문은 드러나지 않는다
// - 운영 화면에서 PIN 을 바꾸면 기존 세션이 전부 무효화된다 (재로그인 요구)
//
// 심사 코드는 세션이 없다 — 제출마다 body 로 받아 그때그때 대조한다 (명세 §7: 경량 게이트).

import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { TournamentState } from './tournament.ts';

export const ADMIN_COOKIE = 'al_admin';
const COOKIE_MAX_AGE = 60 * 60 * 18; // 18시간 — 행사 당일 하루를 넉넉히 덮는다

function secret(): string {
  // 별도 시크릿을 두지 않고 서비스 롤 키를 HMAC 키로 재사용한다.
  // 서버에만 존재하는 값이면 충분하고, 환경 변수 하나라도 줄이는 편이 당일 사고를 줄인다.
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.ADMIN_SESSION_SECRET ?? 'local-ai-vibethon-admin';
}

/** PIN → 세션 토큰. 같은 PIN 이면 언제나 같은 값 (비교용). */
export function deriveAdminToken(pin: string, hmacKey: string = secret()): string {
  return createHmac('sha256', hmacKey).update(`admin:${pin}`).digest('hex');
}

/** 상수 시간 비교 — 길이가 다르면 즉시 false. */
export function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** PIN 검증 후 세션 쿠키 발급. 라우트 핸들러에서만 호출 가능 (쿠키 쓰기 제약). */
export async function grantAdminSession(state: TournamentState, pin: string): Promise<boolean> {
  if (!tokensEqual(deriveAdminToken(pin), deriveAdminToken(state.adminPin))) return false;

  await setAdminCookie(state.adminPin);
  return true;
}

/**
 * PIN 에 대응하는 세션 쿠키를 (재)발급한다. PIN 변경 직후에도 호출해
 * 변경한 운영자 본인이 잠기지 않게 한다.
 *
 * secure 플래그는 오프라인 폴백(로컬 production 빌드에 LAN IP + http 로 접속) 때만
 * ALLOW_INSECURE_ADMIN_COOKIE=1 로 끌 수 있다. 배포 환경에서는 절대 켜지 말 것.
 */
export async function setAdminCookie(pin: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, deriveAdminToken(pin), {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_INSECURE_ADMIN_COOKIE !== '1',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
}

/** 현재 요청이 유효한 운영 세션인지. PIN 이 바뀌었으면 옛 쿠키는 자동으로 불일치. */
export async function isAdminSession(state: TournamentState): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  return tokensEqual(token, deriveAdminToken(state.adminPin));
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
