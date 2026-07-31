import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ seasonId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const { seasonId } = await context.params;
  if (!/^\d{4}-W\d{2}$/.test(seasonId)) {
    return apiError(400, "INVALID_REQUEST", "Season ID is invalid.", undefined, correlationId);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_season_overview", {
      requested_season_id: seasonId,
    });
    if (error) throw error;
    if (!data) return apiError(404, "NOT_FOUND", "Season not found.", undefined, correlationId);
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/seasons/[seasonId]");
  }
}
