import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const [leaderboard, activity] = await Promise.all([
      supabase.rpc("get_public_leaderboard", { result_limit: 3 }),
      supabase.rpc("get_public_activity"),
    ]);
    if (leaderboard.error) throw leaderboard.error;
    if (activity.error) throw activity.error;
    return apiSuccess({
      leaderboard: leaderboard.data,
      activity: activity.data,
    });
  } catch (error) {
    return apiError(
      error instanceof Error && error.message.includes("not configured")
        ? 503
        : 500,
      error instanceof Error && error.message.includes("not configured")
        ? "BACKEND_NOT_CONFIGURED"
        : "SERVER_ERROR",
      safeMessage(error),
    );
  }
}
