import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { queueRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  const url = new URL(request.url);
  const parsed = queueRequestSchema.safeParse({
    playlist: url.searchParams.get("playlist") ?? "quick",
    preferredGame: url.searchParams.get("game") || null,
  });
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Queue preference is invalid.", parsed.error.issues, correlationId);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_queue_health", {
      requested_playlist: parsed.data.playlist,
      requested_game: parsed.data.preferredGame,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matchmaking/health");
  }
}
