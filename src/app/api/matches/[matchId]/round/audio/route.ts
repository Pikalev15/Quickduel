import { apiError, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema } from "@/lib/validation";
import { getSecureRecallReplayTarget } from "@/lib/server/secure-recall";
import { createFrequencyWave } from "@/lib/server/frequency-audio";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  const round = new URL(request.url).searchParams.get("roundIndex");
  if (!matchId.success || round === null || !/^[0-4]$/.test(round)) {
    return apiError(400, "INVALID_REQUEST", "Invalid round.", undefined, correlationId);
  }
  try {
    const { user } = await requireUser();
    await enforceNetworkAbuseBoundary(request, "frequency_replay", 120, 60, { adaptiveChallenge: false });
    const target = await getSecureRecallReplayTarget(matchId.data, user.id, Number(round));
    if (target === null) return apiError(409, "CONFLICT", "That round is not available for replay.", undefined, correlationId);
    return new Response(createFrequencyWave(target), { headers: {
      "Content-Type": "audio/wav",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Correlation-Id": correlationId,
    } });
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/round/audio");
  }
}
