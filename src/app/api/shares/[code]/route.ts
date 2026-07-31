import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const { code } = await context.params;
  if (!/^[A-F0-9]{12}$/i.test(code)) {
    return apiError(400, "INVALID_REQUEST", "Share code is invalid.", undefined, correlationId);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_public_match_share", {
      requested_code: code.toUpperCase(),
    });
    if (error) throw error;
    if (!data) return apiError(404, "NOT_FOUND", "Shared result not found.", undefined, correlationId);
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/shares/[code]");
  }
}
