import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema, submitAnswerSchema } from "@/lib/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGame } from "@/games/registry";

export async function POST(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Request body must be JSON.");
  }
  const parsed = submitAnswerSchema.safeParse(body);
  if (!matchId.success || !parsed.success) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "Game submission is invalid.",
      parsed.success ? undefined : parsed.error.issues,
    );
  }
  try {
    const { supabase, user } = await requireUser();
    const participant = await supabase.rpc("get_match_snapshot", {
      requested_match_id: matchId.data,
    });
    if (participant.error || !participant.data) {
      return apiError(404, "NOT_FOUND", "Match not found.");
    }
    const admin = createSupabaseAdminClient();
    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("challenge_seed,game_type,starts_at,reveal_duration_ms,answer_duration_ms")
      .eq("id", matchId.data)
      .single();
    if (matchError || !match || !match.starts_at) {
      return apiError(409, "CONFLICT", "Match is not ready for answers.");
    }
    const game = getGame(match.game_type);
    const answerStartedAt = Date.parse(match.starts_at) + match.reveal_duration_ms;
    const answerDeadline = answerStartedAt + match.answer_duration_ms;
    if (parsed.data.timedOut && Date.now() < answerDeadline - 250) {
      return apiError(409, "CONFLICT", "The answer window is still open.");
    }
    const challenge = game.generate(String(match.challenge_seed));
    const submission = parsed.data.timedOut
      ? { success: true as const, data: { timedOut: true } }
      : game.submissionSchema.safeParse(parsed.data.submission);
    if (!submission.success) {
      return apiError(400, "INVALID_REQUEST", "Game submission is invalid.", submission.error.issues);
    }
    const completionTimeMs = parsed.data.timedOut
      ? match.answer_duration_ms
      : Math.max(
          0,
          Math.min(match.answer_duration_ms, Date.now() - answerStartedAt),
        );
    const calculated = parsed.data.timedOut
      ? {
          rankScore: -999_999,
          accuracy: 0,
          summary: "No answer",
          details: { timedOut: true },
        }
      : game.calculate(challenge, submission.data, completionTimeMs);
    const correct = Number(calculated.details.correct ?? calculated.details.hits ?? 0);
    const incorrect = Number(
      calculated.details.incorrect ??
        calculated.details.errors ??
        calculated.details.misses ??
        0,
    );
    const { error } = await admin.rpc("submit_game_result", {
      requested_match_id: matchId.data,
      requested_user_id: user.id,
      submitted_payload: submission.data,
      calculated_result: calculated,
      calculated_rank_score: calculated.rankScore,
      calculated_correct: Math.max(0, Math.min(32767, Math.round(correct))),
      calculated_incorrect: Math.max(0, Math.min(32767, Math.round(incorrect))),
    });
    if (error) return apiError(409, "CONFLICT", error.message);
    const { data, error: snapshotError } = await supabase.rpc("get_match_snapshot", {
      requested_match_id: matchId.data,
    });
    if (snapshotError) throw snapshotError;
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
