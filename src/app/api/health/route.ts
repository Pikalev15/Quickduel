import { apiSuccess, requestCorrelationId } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  let supabase = false;
  let migrationCompatible = false;
  try {
    const client = await createSupabaseServerClient();
    const [connectivity, migration] = await Promise.all([
      client.rpc("get_public_activity"),
      client.rpc("get_season_overview", { requested_season_id: null }),
    ]);
    supabase = !connectivity.error;
    migrationCompatible = !migration.error;
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
      timestamp: new Date().toISOString(),
    },
    supabase && migrationCompatible ? 200 : 503,
    correlationId,
  );
}
