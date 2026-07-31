import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";
import { requireUser } from "@/lib/server/route";
import { matchChatReportSchema, matchIdSchema } from "@/lib/validation";

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
  const body = matchChatReportSchema.safeParse(input);
  if (!matchId.success || !body.success) {
    return apiError(400, "INVALID_REQUEST", "Chat report is invalid.", undefined, correlationId);
  }
  try {
    const { supabase, user } = await requireUser();
    await enforceNetworkAbuseBoundary(
      request,
      "chat_report",
      8,
      3600,
      { adaptiveChallenge: user.is_anonymous === true },
    );
    const { data, error } = await supabase.rpc("report_match_chat_message", {
      requested_message_id: body.data.messageId,
      requested_reason: body.data.reason,
    });
    if (error) throw error;
    return apiSuccess({ reported: data === true }, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/chat/report");
  }
}
