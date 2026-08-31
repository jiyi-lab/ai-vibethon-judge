// /api/admin/* 1차 가드 (Next.js 16: middleware → proxy).
//
// 여기서는 쿠키 존재만 본다 — 토큰이 현재 PIN 과 맞는지는 DB 를 읽어야 알 수 있어서
// 각 라우트 핸들러의 isAdminSession() 이 최종 판정한다 (이중 가드).
// 로그인 경로(/api/admin/auth)는 쿠키가 없는 상태에서 호출되므로 제외.

import { NextResponse, type NextRequest } from 'next/server';

// lib/auth.ts 의 ADMIN_COOKIE 와 같은 값. import 하면 next/headers 등
// 라우트 전용 모듈이 proxy 번들에 딸려 오므로 상수만 복제한다.
const ADMIN_COOKIE = 'al_admin';

export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname === '/api/admin/auth') {
    return NextResponse.next();
  }
  if (!request.cookies.has(ADMIN_COOKIE)) {
    return NextResponse.json(
      { ok: false, error: { code: 'UNAUTHORIZED', message: '운영 로그인이 필요합니다.' } },
      { status: 401 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/admin/:path*',
};
