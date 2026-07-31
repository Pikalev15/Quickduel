import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { historyCursorSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  const url = new URL(request.url);
  const parsed = historyCursorSchema.safeParse({
    before: url.searchParams.get("before") ?? undefined,
    beforeId: url.searchParams.get("beforeId") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success || Boolean(parsed.data.before) !== Boolean(parsed.data.beforeId)) {
    return apiError(400, "INVALID_REQUEST", "History cursor is invalid.", parsed.success ? undefined : parsed.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_match_history", {
      requested_limit: parsed.data.limit,
      requested_before: parsed.data.before ?? null,
      requested_before_id: parsed.data.beforeId ?? null,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/history");
  }
}
