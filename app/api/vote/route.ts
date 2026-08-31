// POST /api/vote — 심사 제출 upsert (명세 §3, §4.2).
//
// 서버가 지키는 것 (클라이언트 검증만으로 끝내지 않는다 — 명세 §7):
// - 심사 코드 검증
// - 명단에 없는 명의 거부 (명단제, §3)
// - live 가 아닌 경기 거부 (공개 직후 지연 도착한 제출이 기록을 바꾸는 것 방지)
// - 제출 시각은 서버가 찍는다. 코멘트 길이 서버 컷

import { ensureState } from '@/lib/state';
import { upsertVote } from '@/lib/votes';
import { findJudge, judgeSlug, matchesJudgeCode } from '@/lib/tournament';
import { CRITERIA, totalScore, winningSideFromScores, type FeedbackSet, type MatchScores } from '@/lib/scoring';
import { handling, ok, fail, readJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

const COMMENT_MAX = 500;

function parseScores(raw: unknown): MatchScores | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const out = { A: {}, B: {} } as MatchScores;

  for (const side of ['A', 'B'] as const) {
    const sideRaw = source[side];
    if (typeof sideRaw !== 'object' || sideRaw === null) return null;
    const sideSource = sideRaw as Record<string, unknown>;
    for (const criterion of CRITERIA) {
      const value = Number(sideSource[criterion.key]);
      if (!Number.isFinite(value) || value < 0 || value > criterion.max) return null;
      out[side][criterion.key] = Math.round(value);
    }
  }

  return out;
}

function parseFeedback(raw: unknown, side: 'A' | 'B'): FeedbackSet {
  const empty = { good: '', improve: '', other: '' };
  if (typeof raw !== 'object' || raw === null) return empty;
  const sideRaw = (raw as Record<string, unknown>)[side];
  if (typeof sideRaw !== 'object' || sideRaw === null) return empty;
  const source = sideRaw as Record<string, unknown>;
  return {
    good: typeof source.good === 'string' ? source.good.trim().slice(0, COMMENT_MAX) : '',
    improve: typeof source.improve === 'string' ? source.improve.trim().slice(0, COMMENT_MAX) : '',
    other: typeof source.other === 'string' ? source.other.trim().slice(0, COMMENT_MAX) : '',
  };
}

function serializeFeedback(feedback: FeedbackSet): string | null {
  return Object.values(feedback).some(Boolean) ? JSON.stringify(feedback) : null;
}

export async function POST(request: Request): Promise<Response> {
  return handling(async () => {
    const body = await readJson(request);
    if (!body) return fail(400, 'BAD_REQUEST', '잘못된 요청입니다.');

    const code = typeof body.code === 'string' ? body.code : '';
    const matchId = typeof body.matchId === 'string' ? body.matchId : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const scores = parseScores(body.scores);

    const { data: state } = await ensureState();

    if (!matchesJudgeCode(state, code)) {
      return fail(401, 'BAD_JUDGE_CODE', '심사 코드가 올바르지 않습니다.');
    }

    const registered = findJudge(state, name);
    if (!registered) {
      return fail(403, 'JUDGE_NOT_LISTED', '심사위원 명단에 없는 이름입니다. 운영팀에 문의하세요.');
    }

    const match = state.matches.find((m) => m.id === matchId);
    if (!match) return fail(400, 'MATCH_NOT_FOUND', `경기 ${matchId} 를 찾을 수 없습니다.`);
    if (match.status !== 'live') {
      return fail(409, 'MATCH_NOT_LIVE', '지금은 이 경기의 심사 시간이 아닙니다.');
    }

    if (!scores) {
      return fail(400, 'BAD_SCORES', '평가 기준별 점수가 올바르지 않습니다.');
    }

    const feedbackA = parseFeedback(body.feedback, 'A');
    const feedbackB = parseFeedback(body.feedback, 'B');
    const winner = winningSideFromScores(scores);
    const comment = `A ${totalScore(scores.A)}점 / B ${totalScore(scores.B)}점`;

    await upsertVote({
      match_id: match.id,
      judge_slug: judgeSlug(registered),
      name: registered, // 명단에 등록된 표기 그대로 저장 — 대리 입력이어도 심사위원 명의
      winner,
      scores,
      feedback_a: serializeFeedback(feedbackA),
      feedback_b: serializeFeedback(feedbackB),
      comment,
      video_a: body.videoA === true,
      video_b: body.videoB === true,
      ts: Date.now(),
    });

    return ok();
  });
}
