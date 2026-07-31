import { apiSuccess, requestCorrelationId } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  let supabase = false;
  let migrationCompatible = false;
  let expirySweep: {
    last_expiry_sweep_at: string | null;
    last_expiry_sweep_count: number;
  } | null = null;
  try {
    const client = await createSupabaseServerClient();
    const [connectivity, migration] = await Promise.all([
      client.rpc("get_public_activity"),
      client.rpc("get_season_overview", { requested_season_id: null }),
    ]);
    supabase = !connectivity.error;
    migrationCompatible = !migration.error;
    if (migrationCompatible) {
      const runtime = await createSupabaseAdminClient()
        .from("integrity_runtime")
        .select("last_expiry_sweep_at,last_expiry_sweep_count")
        .eq("singleton", true)
        .maybeSingle();
      if (!runtime.error) expirySweep = runtime.data;
    }
  } catch {
    // Health responses remain safe and explicit when configuration is absent.
  }
  return apiSuccess(
    {
      status: supabase && migrationCompatible ? "ok" : "degraded",
      version:
        process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
        process.env.npm_package_version ??
        "development",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      supabase,
      migrationCompatible,
      expirySweep,
      timestamp: new Date().toISOString(),
    },
    supabase && migrationCompatible ? 200 : 503,
    correlationId,
  );
}
