import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema, rematchRequestSchema } from "@/lib/validation";

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
  const parsed = rematchRequestSchema.safeParse(body);
  if (!matchId.success || !parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Rematch request is invalid.", undefined, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("request_rematch", {
      requested_match_id: matchId.data,
    });
    if (error) return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/rematch");
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/rematch");
  }
}
