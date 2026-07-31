import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { matchIdSchema } from "@/lib/validation";
import { requireUser } from "@/lib/server/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGame } from "@/games/registry";
import type { GamePhase } from "@/games/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const parsed = matchIdSchema.safeParse((await context.params).matchId);
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "That match link is invalid.", undefined, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_match_snapshot", {
      requested_match_id: parsed.data,
    });
    if (error) throw error;
    if (!data) return apiError(404, "NOT_FOUND", "Match not found.", undefined, correlationId);
    const admin = createSupabaseAdminClient();
    const { data: privateMatch, error: privateError } = await admin
      .from("matches")
      .select("challenge_seed,game_type,game_version,starts_at,reveal_duration_ms,status,source,private_duel_id,series_round")
      .eq("id", parsed.data)
      .single();
    if (privateError || !privateMatch) throw privateError ?? new Error("Match data missing.");
    const game = getGame(privateMatch.game_type);
    if (game.version !== privateMatch.game_version) {
      return apiError(
        409,
        "CONFLICT",
        "Match game version is not supported.",
        undefined,
        correlationId,
      );
    }
    const now = Date.now();
    const startsAt = privateMatch.starts_at ? Date.parse(privateMatch.starts_at) : null;
    let phase: GamePhase = "waiting";
    if (privateMatch.status === "completed") phase = "result";
    else if (!startsAt || now < startsAt) phase = "countdown";
    else if (now < startsAt + privateMatch.reveal_duration_ms) phase = "reveal";
    else phase = "answer";
    const completeChallenge = game.generate(String(privateMatch.challenge_seed));
    let privateDuelCode: string | null = null;
    if (privateMatch.private_duel_id) {
      const { data: privateDuel } = await admin
        .from("private_duels")
        .select("code")
        .eq("id", privateMatch.private_duel_id)
        .single();
      privateDuelCode = privateDuel?.code ?? null;
    }
    return apiSuccess({
      ...data,
      phase,
      challenge: game.publicChallenge(completeChallenge, phase),
      source: privateMatch.source,
      private_duel_code: privateDuelCode,
      series_round: privateMatch.series_round,
    }, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/matches/[matchId]");
  }
}
