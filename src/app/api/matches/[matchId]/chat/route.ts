import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";
import { requireUser } from "@/lib/server/route";
import { matchChatMessageSchema, matchIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  if (!matchId.success) {
    return apiError(400, "INVALID_REQUEST", "That match link is invalid.", undefined, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_match_chat", {
      requested_match_id: matchId.data,
      requested_after: null,
    });
    if (error) throw error;
    return apiSuccess(data ?? [], 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/chat");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    input = null;
  }
  const body = matchChatMessageSchema.safeParse(input);
  if (!matchId.success || !body.success) {
    return apiError(400, "INVALID_REQUEST", "Chat message is invalid.", undefined, correlationId);
  }
  try {
    const { supabase, user } = await requireUser();
    await enforceNetworkAbuseBoundary(
      request,
      "match_chat",
      30,
      60,
      { adaptiveChallenge: user.is_anonymous === true },
    );
    const { data, error } = await supabase.rpc("send_match_chat_message", {
      requested_match_id: matchId.data,
      requested_body: body.data.body,
    });
    if (error) throw error;
    return apiSuccess(data, 201, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/chat");
  }
}
