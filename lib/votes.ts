// 심사 제출 읽기/쓰기 (명세 §4.2, schema.sql §2).
//
// (match_id, judge_slug) PK upsert — 같은 명의의 재제출은 덮어쓰기,
// 다른 명의의 동시 제출은 서로 다른 행이라 충돌하지 않는다.

import 'server-only';
import { supabaseAdmin } from './supabaseAdmin.ts';
import type { MatchScores } from './scoring.ts';
import { readLocalVotes, shouldUseLocalStore, upsertLocalVote } from './localStore.ts';

export type VoteRow = {
  match_id: string;
  judge_slug: string;
  name: string;
  winner: 'A' | 'B';
  scores: MatchScores | null;
  feedback_a: string | null;
  feedback_b: string | null;
  comment: string | null;
  video_a: boolean;
  video_b: boolean;
  ts: number;
};

const TABLE = 'votes';

export async function upsertVote(vote: VoteRow): Promise<void> {
  if (shouldUseLocalStore()) {
    upsertLocalVote(vote);
    return;
  }

  const { error } = await supabaseAdmin()
    .from(TABLE)
    .upsert({ ...vote, updated_at: new Date().toISOString() }, { onConflict: 'match_id,judge_slug' });
  if (error) throw new Error(`제출 저장 실패: ${error.message}`);
}

export async function votesForMatch(matchId: string): Promise<VoteRow[]> {
  if (shouldUseLocalStore()) {
    return readLocalVotes(matchId);
  }

  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select('match_id, judge_slug, name, winner, scores, feedback_a, feedback_b, comment, video_a, video_b, ts')
    .eq('match_id', matchId)
    .order('ts', { ascending: true });
  if (error) throw new Error(`제출 조회 실패: ${error.message}`);
  return (data ?? []) as VoteRow[];
}

export function feedbackForSide(vote: VoteRow, side: 'A' | 'B'): string | null {
  return side === 'A' ? vote.feedback_a ?? vote.comment : vote.feedback_b ?? vote.comment;
}
