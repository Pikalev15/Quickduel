import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  if (!matchId.success) {
    return apiError(400, "INVALID_REQUEST", "Match ID is invalid.", matchId.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("enable_match_share", {
      requested_match_id: matchId.data,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/share");
  }
}
