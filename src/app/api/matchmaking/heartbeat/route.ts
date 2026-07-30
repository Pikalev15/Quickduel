import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { queueRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const parsed = queueRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Matchmaking preference is invalid.");
    }
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("heartbeat_matchmaking", {
      requested_playlist: parsed.data.playlist,
      requested_game: parsed.data.preferredGame,
    });
    if (error) throw error;
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
