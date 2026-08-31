// Supabase 서비스 롤 클라이언트 — 서버 전용.
//
// service_role 키는 RLS 를 우회하는 마스터 키다. 이 모듈은 API 라우트에서만 import 하고,
// 클라이언트 컴포넌트에 들어가면 안 된다 ('server-only' 가 빌드에서 잡아준다).
//
// 초기화는 지연시킨다 — 모듈 최상단에서 throw 하면 키 없는 CI 빌드가 깨진다 (HANDOFF §2).

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase 환경 변수가 없습니다. .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 확인하세요.',
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
