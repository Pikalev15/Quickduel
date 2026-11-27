import { serverQueueOrDuel } from "@/lib/server/queue-or-duel";
import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";
import { queueRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const parsed = queueRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return apiError(400, "INVALID_REQUEST", "Matchmaking preference is invalid.", undefined, correlationId);
    }
    const { user } = await requireUser();
    await enforceNetworkAbuseBoundary(request, "matchmaking_heartbeat", 240, 60, { adaptiveChallenge: false });
    const { data, error } = await serverQueueOrDuel(user.id, "heartbeat_matchmaking", {
      requested_playlist: parsed.data.playlist,
      requested_game: parsed.data.preferredGame,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matchmaking/heartbeat");
  }
}
