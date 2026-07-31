import { getGame } from "@/games/registry";
import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { matchIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  if (!matchId.success) {
    return apiError(400, "INVALID_REQUEST", "Match ID is invalid.", matchId.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_match_history_detail", {
      requested_match_id: matchId.data,
    });
    if (error) throw error;
    if (!data) return apiError(404, "NOT_FOUND", "Completed match not found.", undefined, correlationId);
    const admin = createSupabaseAdminClient();
    const { data: privateMatch, error: privateError } = await admin
      .from("matches")
      .select("challenge_seed,game_type")
      .eq("id", matchId.data)
      .single();
    if (privateError || !privateMatch) throw privateError ?? new Error("Match data missing");
    const challenge = getGame(privateMatch.game_type).generate(String(privateMatch.challenge_seed));
    return apiSuccess({ ...data, challenge }, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/history/[matchId]");
  }
}
