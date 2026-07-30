import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_public_leaderboard", {
      result_limit: 100,
    });
    if (error) throw error;
    return apiSuccess(data);
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
