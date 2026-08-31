// POST /api/admin/auth — PIN 로그인, 파생 토큰 쿠키 발급.
// DELETE — 로그아웃 (쿠키 삭제).
//
// proxy.ts 의 /api/admin/* 가드에서 유일하게 제외되는 경로.

import { ensureState } from '@/lib/state';
import { grantAdminSession, clearAdminSession } from '@/lib/auth';
import { handling, ok, fail, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handling(async () => {
    const body = await readJson(request);
    const pin = typeof body?.pin === 'string' ? body.pin : '';
    if (!pin) return fail(400, 'BAD_REQUEST', 'PIN 을 입력하세요.');

    const { data: state } = await ensureState();
    if (!(await grantAdminSession(state, pin))) {
      return fail(401, 'BAD_PIN', 'PIN 이 올바르지 않습니다.');
    }
    return ok();
  });
}

export async function DELETE(): Promise<Response> {
  return handling(async () => {
    await clearAdminSession();
    return ok();
  });
}
