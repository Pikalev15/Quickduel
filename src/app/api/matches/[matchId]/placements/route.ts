import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { matchIdSchema } from "@/lib/validation";
import { getPlacement } from "@/lib/placements";
import type { MatchSnapshot } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ matchId: string }> }) {
  const correlationId = requestCorrelationId(request);
  const parsed = matchIdSchema.safeParse((await context.params).matchId);
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "That match link is invalid.", undefined, correlationId);
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.rpc("get_match_snapshot", { requested_match_id: parsed.data });
    if (error) throw error;
    const snapshot = data as MatchSnapshot | null;
    if (!snapshot?.players?.some((player) => player.user_id === user.id)) {
      return apiError(404, "NOT_FOUND", "Match not found.", undefined, correlationId);
    }
    const { data: profiles, error: profileError } = await createSupabaseAdminClient().from("profiles")
      .select("id,matches_played").in("id", snapshot.players.map((player) => player.user_id));
    if (profileError) throw profileError;
    return apiSuccess(Object.fromEntries((profiles ?? []).flatMap((profile) => {
      const placement = getPlacement(profile.matches_played);
      return placement ? [[profile.id, placement.completed]] : [];
    })), 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]/placements");
  }
}
