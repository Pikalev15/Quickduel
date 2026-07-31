import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { friendSearchSchema } from "@/lib/validation";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  const parsed = friendSearchSchema.safeParse({
    query: new URL(request.url).searchParams.get("query") ?? "",
  });
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Enter an exact player name or code.", parsed.error.issues, correlationId);
  }
  try {
    const { supabase, user } = await requireUser();
    await enforceNetworkAbuseBoundary(
      request,
      "friend_search",
      60,
      600,
      { adaptiveChallenge: user.is_anonymous === true },
    );
    const { data, error } = await supabase.rpc("search_players", {
      requested_query: parsed.data.query,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/friends/search");
  }
}
