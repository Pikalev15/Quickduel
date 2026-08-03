import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import {
  colourRoundSubmissionSchema,
  frequencyRoundSubmissionSchema,
} from "@/games/recall-rounds";
import { matchIdSchema } from "@/lib/validation";
import { requireUser } from "@/lib/server/route";
import { rpcErrorResponse } from "@/lib/server/http";
import {
  advanceSecureRecallRound,
  submitSecureRecallRound,
} from "@/lib/server/secure-recall";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  if (!matchId.success) {
    return apiError(400, "INVALID_REQUEST", "That match link is invalid.", undefined, correlationId);
  }
  try {
    const { user } = await requireUser();
    const state = await advanceSecureRecallRound(matchId.data, user.id);
    return apiSuccess(state, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/round");
  }
}

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
  if (!matchId.success) {
    return apiError(400, "INVALID_REQUEST", "That match link is invalid.", undefined, correlationId);
  }
  try {
    const { user } = await requireUser();
    await enforceNetworkAbuseBoundary(request, "recall_round_submission", 40, 60, {
      adaptiveChallenge: user.is_anonymous === true,
    });
    const admin = createSupabaseAdminClient();
    const { data: match, error } = await admin
      .from("matches")
      .select("game_type")
      .eq("id", matchId.data)
      .single();
    if (error || !match) throw error ?? new Error("QD_MATCH_NOT_FOUND");
    const schema = match.game_type === "frequency_recall_v2"
      ? frequencyRoundSubmissionSchema
      : match.game_type === "colour_recall_v2"
        ? colourRoundSubmissionSchema
        : null;
    if (!schema) {
      return apiError(409, "CONFLICT", "This match does not use round submissions.", undefined, correlationId);
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Round submission is invalid.", parsed.error.issues, correlationId);
    }
    const state = await submitSecureRecallRound(
      matchId.data,
      user.id,
      parsed.data.roundIndex,
      parsed.data.answer,
    );
    return apiSuccess(state, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/round");
  }
}
