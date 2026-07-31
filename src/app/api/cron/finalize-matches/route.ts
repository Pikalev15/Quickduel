import { timingSafeEqual } from "node:crypto";
import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  if (!authorized(request)) {
    return apiError(401, "UNAUTHENTICATED", "Cron authorization failed.", undefined, correlationId);
  }
  try {
    const admin = createSupabaseAdminClient();
    const [finalization, cleanup] = await Promise.all([
      admin.rpc("finalize_expired_matches", { requested_limit: 200 }),
      admin.rpc("cleanup_integrity_data"),
    ]);
    if (finalization.error) throw finalization.error;
    if (cleanup.error) throw cleanup.error;
    return apiSuccess({
      finalization: finalization.data,
      cleanup: cleanup.data,
    }, 200, correlationId);
  } catch {
    return apiError(
      500,
      "SERVER_ERROR",
      "Scheduled finalization failed.",
      undefined,
      correlationId,
    );
  }
}
