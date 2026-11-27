import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema } from "@/lib/validation";
import { rpcErrorResponse } from "@/lib/server/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";
import { z } from "zod";

export const dynamic = "force-dynamic";
const schema = z.object({ roundIndex: z.number().int().min(0).max(4) }).strict();

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!matchId.success || !body.success) return apiError(400, "INVALID_REQUEST", "Invalid round.", undefined, correlationId);
  try {
    const { user } = await requireUser();
    await enforceNetworkAbuseBoundary(request, "frequency_listened", 40, 60, { adaptiveChallenge: false });
    const { error } = await createSupabaseAdminClient().rpc("ack_frequency_listened", {
      requested_match_id: matchId.data, requested_user_id: user.id, requested_round_index: body.data.roundIndex,
    });
    if (error) throw error;
    return apiSuccess({ acknowledged: true }, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/round/listen");
  }
}
