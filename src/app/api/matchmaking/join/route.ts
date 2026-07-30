import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { requireUser } from "@/lib/server/route";

export async function POST() {
  try {
    const { supabase } = await requireUser();
    const profileResult = await supabase.rpc("ensure_profile");
    if (profileResult.error) throw profileResult.error;

    const { data, error } = await supabase.rpc("join_matchmaking");
    if (error) throw error;
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Start a new session to play.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
