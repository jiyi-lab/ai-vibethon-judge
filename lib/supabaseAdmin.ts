// Supabase 클라이언트 — 서버 전용.
//
// 이 모듈은 API 라우트에서만 import 하고, 클라이언트 컴포넌트에 들어가면 안 된다
// ('server-only' 가 빌드에서 잡아준다).
//
// 초기화는 지연시킨다 — 모듈 최상단에서 throw 하면 키 없는 CI 빌드가 깨진다 (HANDOFF §2).
//
// ── 왜 vibethon 스키마 + 전용 키인가 (2026-08-31) ──────────────
// 무료 플랜 활성 프로젝트 한도(계정당 2개) 때문에 이 앱은 **다른 용도로 쓰던 기존
// Supabase 프로젝트에 얹혀 산다**. 그래서 두 가지가 필요하다.
//
//   · 스키마 분리 — 테이블이 vibethon 스키마 안에만 살아서 호스트 프로젝트의
//     public 과 섞이지 않는다. PostgREST 가 이 스키마를 서빙하려면 대시보드
//     Settings > API > Exposed schemas 에 vibethon 이 올라가 있어야 한다.
//
//   · 권한 분리 — 붙는 신분이 service_role 이 아니라 vibethon_app 이다.
//     service_role 은 그 프로젝트 DB 전체의 마스터 키라, 그걸 이 앱에 넣으면
//     행사 앱이 뚫렸을 때 호스트 프로젝트 데이터까지 열린다. 스키마만 나누는 것으로는
//     권한이 전혀 줄지 않으므로 이쪽이 본체다 (supabase/schema.sql §0).
//
// 키는 scripts/mint-supabase-key.mjs 로 발급한다.

import 'server-only';
import { createClient } from '@supabase/supabase-js';

/** 이 앱의 테이블이 사는 스키마. 호스트 프로젝트의 public 과 분리된다. */
export const DB_SCHEMA = 'vibethon';

// 클라이언트 타입은 만들어서 추론한다 — SupabaseClient 의 스키마 제네릭 기본값이
// 'public' 이라 그대로 쓰면 vibethon 클라이언트가 대입되지 않고, 제네릭 인자 자리를
// 손으로 적으면 supabase-js 버전이 올라갈 때 조용히 깨진다.
function createAppClient(url: string, key: string) {
  return createClient(url, key, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type AppClient = ReturnType<typeof createAppClient>;

let client: AppClient | null = null;

/**
 * 앱이 쓸 API 키.
 *
 * 권장은 vibethon_app role 로 발급한 `SUPABASE_VIBETHON_KEY`.
 * `SUPABASE_SERVICE_ROLE_KEY` 도 받아주지만 **대체 경로**다 — JWT 시크릿을 못 구해
 * 전용 키를 만들지 못했을 때만 쓴다. 그 경우 호스트 프로젝트까지 열리는 키를
 * 한 벌 더 두는 셈이라는 걸 알고 써야 한다.
 */
export function supabaseKey(): string | undefined {
  return process.env.SUPABASE_VIBETHON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Supabase 로 붙을 수 있는 상태인지 — 아니면 로컬 파일 저장소로 떨어진다. */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && supabaseKey());
}

export function supabaseAdmin(): AppClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = supabaseKey();
  if (!url || !key) {
    throw new Error(
      'Supabase 환경 변수가 없습니다. NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_VIBETHON_KEY 를 확인하세요.',
    );
  }

  client = createAppClient(url, key);
  return client;
}
