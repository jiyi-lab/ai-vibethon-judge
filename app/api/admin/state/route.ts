// GET /api/admin/state — 운영 화면 초기 로드·폴링용 스냅샷.
//
// 공개 스냅샷과 달리 judges·judgeCode·트랙 경고를 포함한다 (adminPin 은 제외).

import { ensureState } from '@/lib/state';
import { isAdminSession } from '@/lib/auth';
import { trackWarnings } from '@/lib/tournament';
import { handling, ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return handling(async () => {
    const row = await ensureState();
    if (!(await isAdminSession(row.data))) {
      return fail(401, 'UNAUTHORIZED', '운영 세션이 없거나 만료됐습니다. 다시 로그인하세요.');
    }

    const { teams, matches, judges, judgeCode } = row.data;
    return ok({
      state: {
        teams,
        matches,
        judges,
        judgeCode,
        // timer 누락이 "콘솔 타이머가 폴링마다 --:-- 로 리셋"되는 버그였다 (8/22).
        // 액션 응답(adminView)에는 있었는데 폴링 스냅샷에만 빠져 있었음
        timer: row.data.timer ?? null,
        /** 서버 현재 시각 — 기기 시계 편차 보정용 (lib/clock.ts) */
        now: Date.now(),
        rev: row.rev,
        trackWarnings: trackWarnings(row.data),
      },
    });
  });
}
