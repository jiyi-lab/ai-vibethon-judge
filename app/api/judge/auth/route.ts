// POST /api/judge/auth — 심사 코드 검증 → 심사위원 명단 반환.
//
// 심사 화면 입장 절차 (명세 §3): 코드 통과 후 명단에서 본인 이름을 고른다.
// 명단은 공개 상태(GET /api/state)에 포함되지 않으므로 이 경로가 유일한 조회 창구다.

import { ensureState } from '@/lib/state';
import { matchesJudgeCode } from '@/lib/tournament';
import { handling, ok, fail, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return handling(async () => {
    const body = await readJson(request);
    const code = typeof body?.code === 'string' ? body.code : '';
    if (!code) return fail(400, 'BAD_REQUEST', '심사 코드를 입력하세요.');

    const { data: state } = await ensureState();
    if (!matchesJudgeCode(state, code)) {
      return fail(401, 'BAD_JUDGE_CODE', '심사 코드가 올바르지 않습니다.');
    }

    return ok({ judges: state.judges });
  });
}
