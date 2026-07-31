import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const parsed = matchIdSchema.safeParse((await context.params).matchId);
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "That match link is invalid.", undefined, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("mark_match_ready", {
      requested_match_id: parsed.data,
    });
    if (error) {
      return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/ready");
    }
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/ready");
  }
}
