// 서버 시계 동기 — 타이머 표시용.
//
// 남은 시간 = seconds − (지금 − startedAt) 인데 startedAt 은 서버 시각이다.
// 기기 시계가 서버와 어긋나 있으면(수십 초 틀어진 노트북 흔함) 그 편차가
// 그대로 표시 오차가 된다. 폴링 응답에 실려 오는 서버 now 로 편차를 기록해 두고,
// 타이머 계산은 serverNow() 를 쓴다 — 오차가 네트워크 왕복(수백 ms) 수준으로 준다.
//
// /api/state 는 CDN 캐시(s-maxage=2, SWR 8)가 있어 응답 now 가 최대 ~10초 낡을 수
// 있다 — Age 헤더(캐시된 초 수)로 보정한다. 무캐시 라우트는 age 를 안 주면 0.

let skewMs = 0;

/** 폴링 성공 시마다 호출 — 서버 now(epoch ms)와 응답의 Age 헤더로 편차 갱신. */
export function noteServerNow(serverNowMs: unknown, ageHeader?: string | null): void {
  if (typeof serverNowMs !== 'number' || !Number.isFinite(serverNowMs)) return;
  const age = ageHeader == null ? 0 : Number(ageHeader);
  const corrected = serverNowMs + (Number.isFinite(age) && age > 0 ? age * 1000 : 0);
  skewMs = corrected - Date.now();
}

/** 서버 기준 현재 시각 — 타이머 남은 시간 계산은 반드시 이걸로. */
export function serverNow(): number {
  return Date.now() + skewMs;
}
