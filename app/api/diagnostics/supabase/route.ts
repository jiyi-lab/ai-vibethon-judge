import { DB_SCHEMA, supabaseApiKey, supabaseAuthToken } from '@/lib/supabaseAdmin';
import { handling, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const normalized = part.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  return handling(async () => {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = supabaseApiKey();
    const authToken = supabaseAuthToken();
    const payload = authToken ? decodeJwtPayload(authToken) : null;

    let url: URL;
    try {
      if (!rawUrl) throw new Error('missing');
      url = new URL(rawUrl);
    } catch {
      return ok({
        configured: false,
        schema: DB_SCHEMA,
        urlPresent: Boolean(rawUrl),
        urlValid: false,
        apiKeyPresent: Boolean(apiKey),
        authTokenPresent: Boolean(authToken),
        keyLooksJwt: Boolean(payload),
        role: payload?.role ?? null,
      });
    }

    if (!apiKey || !authToken) {
      return ok({
        configured: false,
        schema: DB_SCHEMA,
        urlPresent: true,
        urlValid: true,
        host: url.host,
        apiKeyPresent: Boolean(apiKey),
        authTokenPresent: Boolean(authToken),
      });
    }

    const endpoint = `${url.origin}/rest/v1/tournament_state?select=id&limit=1`;
    try {
      const res = await fetch(endpoint, {
        headers: {
          apikey: apiKey,
          authorization: `Bearer ${authToken}`,
          accept: 'application/json',
          'accept-profile': DB_SCHEMA,
        },
        cache: 'no-store',
      });
      const text = await res.text();
      return ok({
        configured: true,
        schema: DB_SCHEMA,
        host: url.host,
        apiKeyPresent: true,
        authTokenPresent: true,
        keyLooksJwt: Boolean(payload),
        role: payload?.role ?? null,
        status: res.status,
        statusText: res.statusText,
        bodyPreview: text.slice(0, 500),
      });
    } catch (err) {
      const cause = err instanceof Error && 'cause' in err ? (err as Error & { cause?: unknown }).cause : null;
      return ok({
        configured: true,
        schema: DB_SCHEMA,
        host: url.host,
        endpoint,
        apiKeyPresent: true,
        authTokenPresent: true,
        keyLooksJwt: Boolean(payload),
        role: payload?.role ?? null,
        fetchOk: false,
        fetchError: err instanceof Error ? `${err.name}: ${err.message}` : 'Supabase fetch failed',
        fetchCause: cause instanceof Error ? `${cause.name}: ${cause.message}` : cause ? String(cause) : null,
      });
    }
  });
}
