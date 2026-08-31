// API 라우트 공통 응답 헬퍼.
//
// 모든 라우트가 { ok: true, ... } / { ok: false, error: { code, message } } 모양을 지킨다.
// TournamentError(가드 위반)는 409 — 클라이언트가 code 로 분기해 운영 화면 문구를 띄운다.

import 'server-only';
import { TournamentError } from './tournament.ts';

export function ok(body: Record<string, unknown> = {}, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...body }, init);
}

export function fail(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

/** 라우트 본문을 감싸 가드 위반 → 409, 그 외 → 500 으로 변환한다. */
export async function handling(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TournamentError) return fail(409, err.code, err.message);
    console.error('[api]', err);
    const message = err instanceof Error ? err.message : '알 수 없는 오류';
    return fail(500, 'INTERNAL', message);
  }
}

/** body 를 JSON 으로 읽는다. 아니면 null — 라우트가 400 으로 처리. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
