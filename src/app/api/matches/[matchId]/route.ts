import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { matchIdSchema } from "@/lib/validation";
import { requireUser } from "@/lib/server/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGame } from "@/games/registry";
import type { GamePhase } from "@/games/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const parsed = matchIdSchema.safeParse((await context.params).matchId);
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "That match link is invalid.");
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_match_snapshot", {
      requested_match_id: parsed.data,
    });
    if (error) throw error;
    if (!data) return apiError(404, "NOT_FOUND", "Match not found.");
    const admin = createSupabaseAdminClient();
    const { data: privateMatch, error: privateError } = await admin
      .from("matches")
      .select("challenge_seed,game_type,starts_at,reveal_duration_ms,status")
      .eq("id", parsed.data)
      .single();
    if (privateError || !privateMatch) throw privateError ?? new Error("Match data missing.");
    const game = getGame(privateMatch.game_type);
    const now = Date.now();
    const startsAt = privateMatch.starts_at ? Date.parse(privateMatch.starts_at) : null;
    let phase: GamePhase = "waiting";
    if (privateMatch.status === "completed") phase = "result";
    else if (!startsAt || now < startsAt) phase = "countdown";
    else if (now < startsAt + privateMatch.reveal_duration_ms) phase = "reveal";
    else phase = "answer";
    const completeChallenge = game.generate(String(privateMatch.challenge_seed));
    return apiSuccess({
      ...data,
      phase,
      challenge: game.publicChallenge(completeChallenge, phase),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    console.error("[matches:get] Failed to build match snapshot", error);
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
