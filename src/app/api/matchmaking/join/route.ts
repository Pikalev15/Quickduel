import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { queueRequestSchema } from "@/lib/validation";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const parsed = queueRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Matchmaking preference is invalid.", undefined, correlationId);
    }
    const { supabase, user } = await requireUser();
    await enforceNetworkAbuseBoundary(
      request,
      "matchmaking_join",
      20,
      60,
      { adaptiveChallenge: user.is_anonymous === true },
    );
    const profileResult = await supabase.rpc("ensure_profile");
    if (profileResult.error) throw profileResult.error;

    const { data, error } = await supabase.rpc("join_matchmaking", {
      requested_playlist: parsed.data.playlist,
      requested_game: parsed.data.preferredGame,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matchmaking/join");
  }
}
