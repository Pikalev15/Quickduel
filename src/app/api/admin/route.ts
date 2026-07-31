import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { publicCodeSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const { supabase } = await requireUser();
    const requestedCode = new URL(request.url).searchParams.get("code");
    if (requestedCode) {
      const parsedCode = publicCodeSchema.safeParse(requestedCode);
      if (!parsedCode.success) {
        return apiError(400, "INVALID_REQUEST", "Public code is invalid.", parsedCode.error.issues, correlationId);
      }
      const lookup = await supabase.rpc("admin_lookup_player", {
        requested_public_code: parsedCode.data,
      });
      if (lookup.error) throw lookup.error;
      return apiSuccess({ player: lookup.data }, 200, correlationId);
    }
    const [overview, analytics] = await Promise.all([
      supabase.rpc("get_admin_overview"),
      supabase.rpc("get_analytics_report", {
        requested_since: new Date(Date.now() - 30 * 86_400_000).toISOString(),
      }),
    ]);
    if (overview.error) throw overview.error;
    return apiSuccess(
      {
        ...overview.data,
        analytics: analytics.error ? null : analytics.data,
      },
      200,
      correlationId,
    );
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/admin");
  }
}
