import { getGame } from "@/games/registry";
import {
  calculateRecallRoundFeedback,
  isSecureRecallGame,
  recallRoundTarget,
  type RecallRoundState,
  type SecureRecallGameId,
} from "@/games/recall-rounds";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RecallMatchPrivate = {
  challenge_seed: number;
  game_type: SecureRecallGameId;
  game_version: number;
};

async function privateRecallMatch(matchId: string): Promise<RecallMatchPrivate> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("matches")
    .select("challenge_seed,game_type,game_version")
    .eq("id", matchId)
    .single();
  if (error || !data || !isSecureRecallGame(data.game_type) || data.game_version !== 2) {
    throw error ?? new Error("QD_MATCH_NOT_FOUND");
  }
  return data as RecallMatchPrivate;
}

async function targetCandidate(
  matchId: string,
  match: RecallMatchPrivate,
) {
  const admin = createSupabaseAdminClient();
  const { data: currentRound, error } = await admin
    .from("match_rounds")
    .select("round_index,resolved_at,feedback_ends_at")
    .eq("match_id", matchId)
    .order("round_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const feedbackEnded = currentRound?.feedback_ends_at
    ? Date.now() >= Date.parse(currentRound.feedback_ends_at)
    : false;
  const targetRoundIndex = currentRound
    ? Math.min(4, currentRound.round_index + (currentRound.resolved_at && feedbackEnded ? 1 : 0))
    : 0;
  const challenge = getGame(match.game_type).generate(String(match.challenge_seed));
  return {
    targetRoundIndex,
    target: recallRoundTarget(match.game_type, challenge, targetRoundIndex),
  };
}

export async function advanceSecureRecallRound(
  matchId: string,
  userId: string,
): Promise<RecallRoundState> {
  const match = await privateRecallMatch(matchId);
  const candidate = await targetCandidate(matchId, match);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("advance_recall_round", {
    requested_match_id: matchId,
    requested_user_id: userId,
    requested_target_round_index: candidate.targetRoundIndex,
    requested_target: candidate.target,
  });
  if (error) throw error;
  return data as RecallRoundState;
}

export async function submitSecureRecallRound(
  matchId: string,
  userId: string,
  roundIndex: number,
  answer: unknown,
): Promise<RecallRoundState> {
  const state = await advanceSecureRecallRound(matchId, userId);
  if (state.phase !== "answer" || state.roundIndex !== roundIndex) {
    throw new Error("QD_ROUND_CLOSED");
  }
  const match = await privateRecallMatch(matchId);
  const challenge = getGame(match.game_type).generate(String(match.challenge_seed));
  const target = recallRoundTarget(match.game_type, challenge, roundIndex);
  const feedback = calculateRecallRoundFeedback(
    match.game_type,
    target,
    answer as never,
  );
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("submit_recall_round", {
    requested_match_id: matchId,
    requested_user_id: userId,
    requested_round_index: roundIndex,
    submitted_answer: answer,
    calculated_feedback: feedback,
    calculated_score: feedback.score,
  });
  if (error) throw error;
  return advanceSecureRecallRound(matchId, userId);
}
