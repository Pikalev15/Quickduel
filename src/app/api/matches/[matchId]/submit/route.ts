import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema, submitAnswerSchema } from "@/lib/validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGame } from "@/games/registry";
import { isDuplicateSubmission } from "@/lib/server/domain-errors";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";

export async function POST(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Request body must be JSON.", undefined, correlationId);
  }
  const parsed = submitAnswerSchema.safeParse(body);
  if (!matchId.success || !parsed.success) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "Game submission is invalid.",
      parsed.success ? undefined : parsed.error.issues,
      correlationId,
    );
  }
  try {
    const { supabase, user } = await requireUser();
    await enforceNetworkAbuseBoundary(
      request,
      "match_submission",
      40,
      60,
      { adaptiveChallenge: user.is_anonymous === true },
    );
    const rateLimit = await supabase.rpc("check_rate_limit", {
      requested_action: "match_submission",
      requested_limit: 30,
      requested_window_seconds: 60,
    });
    if (rateLimit.error) return apiError(429, "RATE_LIMITED", rateLimit.error.message, undefined, correlationId);
    const participant = await supabase.rpc("get_match_snapshot", {
      requested_match_id: matchId.data,
    });
    if (participant.error || !participant.data) {
      return apiError(404, "NOT_FOUND", "Match not found.", undefined, correlationId);
    }
    const admin = createSupabaseAdminClient();
    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("challenge_seed,game_type,game_version,starts_at,reveal_duration_ms,answer_duration_ms")
      .eq("id", matchId.data)
      .single();
    if (matchError || !match || !match.starts_at) {
      return apiError(409, "CONFLICT", "Match is not ready for answers.", undefined, correlationId);
    }
    const game = getGame(match.game_type);
    if (game.version !== match.game_version) {
      return apiError(
        409,
        "CONFLICT",
        "Match game version is not supported.",
        undefined,
        correlationId,
      );
    }
    const answerStartedAt = Date.parse(match.starts_at) + match.reveal_duration_ms;
    const answerDeadline = answerStartedAt + match.answer_duration_ms;
    const receivedAt = Date.now();
    if (receivedAt < answerStartedAt) {
      return apiError(409, "CONFLICT", "The answer window has not started.", undefined, correlationId);
    }
    if (parsed.data.timedOut && receivedAt < answerDeadline - 250) {
      return apiError(409, "CONFLICT", "The answer window is still open.", undefined, correlationId);
    }
    if (
      !parsed.data.timedOut &&
      game.submitAtDeadline &&
      receivedAt < answerDeadline - 250
    ) {
      return apiError(409, "CONFLICT", "This game submits at the deadline.", undefined, correlationId);
    }
    const challenge = game.generate(String(match.challenge_seed));
    const submission = parsed.data.timedOut
      ? { success: true as const, data: { timedOut: true } }
      : game.submissionSchema.safeParse(parsed.data.submission);
    if (!submission.success) {
      return apiError(400, "INVALID_REQUEST", "Game submission is invalid.", submission.error.issues, correlationId);
    }
    if (
      !parsed.data.timedOut &&
      game.validateSubmission &&
      !game.validateSubmission(challenge, submission.data)
    ) {
      return apiError(
        400,
        "INVALID_REQUEST",
        "Game submission is invalid.",
        undefined,
        correlationId,
      );
    }
    const completionTimeMs = parsed.data.timedOut
      ? match.answer_duration_ms
      : Math.max(
          0,
          Math.min(match.answer_duration_ms, receivedAt - answerStartedAt),
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
    if (error) {
      if (isDuplicateSubmission(error)) {
        await admin.from("abuse_flags").insert({
          user_id: user.id,
          match_id: matchId.data,
          signal: "duplicate_submission",
          severity: 2,
          evidence: {},
        });
      }
      throw error;
    }
    if (
      !parsed.data.timedOut &&
      completionTimeMs < 150 &&
      calculated.accuracy >= 0.99
    ) {
      await admin.from("abuse_flags").insert({
        user_id: user.id,
        match_id: matchId.data,
        signal: "impossible_completion_time",
        severity: 3,
        evidence: {
          completion_time_ms: completionTimeMs,
          accuracy: calculated.accuracy,
          game_type: match.game_type,
        },
      });
    }
    if (
      match.game_type === "typing_sprint" &&
      Number(calculated.details.netWpm ?? 0) > 180 &&
      calculated.accuracy >= 0.98
    ) {
      await admin.from("abuse_flags").insert({
        user_id: user.id,
        match_id: matchId.data,
        signal: "implausible_typing_speed",
        severity: 2,
        evidence: {
          net_wpm: calculated.details.netWpm,
          accuracy: calculated.accuracy,
          game_type: match.game_type,
        },
      });
    }
    const { data, error: snapshotError } = await supabase.rpc("get_match_snapshot", {
      requested_match_id: matchId.data,
    });
    if (snapshotError) throw snapshotError;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/submit");
  }
}
