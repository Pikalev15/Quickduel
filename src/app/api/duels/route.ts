import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson, rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { privateDuelCreateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? privateDuelCreateSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Private duel settings are invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("create_private_duel", {
      requested_selection_kind: parsed.data.selectionKind,
      requested_game: parsed.data.game,
      requested_playlist: parsed.data.playlist,
      requested_best_of: parsed.data.bestOf,
      requested_ranked: parsed.data.ranked,
    });
    if (error) throw error;
    return apiSuccess(data, 201, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/duels");
  }
}
