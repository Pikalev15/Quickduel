import { apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("leave_matchmaking");
    if (error) throw error;
    return apiSuccess({ left: true }, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matchmaking/leave");
  }
}
