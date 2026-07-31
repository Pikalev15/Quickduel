import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson, rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { adminInvalidateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? adminInvalidateSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Match invalidation is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("admin_invalidate_match", {
      requested_match_id: parsed.data.matchId,
      requested_reason: parsed.data.reason,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/admin/matches/invalidate");
  }
}
