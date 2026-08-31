// GET /api/admin/votes?matchId= — 경기별 집계 열람 (운영 화면 전용, 명세 §3).
//
// 심사위원 상호 간 표는 비공개 — 이 경로만이 표·코멘트·영상 대체 플래그를 보여준다.
// 동표 판정은 서버가 하지 않는다. tally 를 내려주고 경고 표시는 운영 화면의 몫.

import { ensureState } from '@/lib/state';
import { isAdminSession } from '@/lib/auth';
import { votesForMatch } from '@/lib/votes';
import { sideTotal } from '@/lib/scoring';
import { handling, ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handling(async () => {
    const row = await ensureState();
    if (!(await isAdminSession(row.data))) {
      return fail(401, 'UNAUTHORIZED', '운영 세션이 없거나 만료됐습니다. 다시 로그인하세요.');
    }

    const matchId = new URL(request.url).searchParams.get('matchId');
    if (!matchId) return fail(400, 'BAD_REQUEST', 'matchId 가 필요합니다.');
    if (!row.data.matches.some((m) => m.id === matchId)) {
      return fail(400, 'MATCH_NOT_FOUND', `경기 ${matchId} 를 찾을 수 없습니다.`);
    }

    const votes = await votesForMatch(matchId);
    const totals = votes.reduce(
      (acc, vote) => {
        if (vote.scores) {
          acc.A += sideTotal(vote.scores, 'A');
          acc.B += sideTotal(vote.scores, 'B');
        }
        return acc;
      },
      { A: 0, B: 0 },
    );
    return ok({ votes, tally: totals });
  });
}
