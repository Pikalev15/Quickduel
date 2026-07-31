import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson, rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import {
  duelInvitationSchema,
  invitationResponseSchema,
} from "@/lib/validation";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? duelInvitationSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Duel invitation is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("send_duel_invitation", {
      requested_public_code: parsed.data.publicCode,
      requested_selection_kind: parsed.data.selectionKind,
      requested_game: parsed.data.game,
      requested_playlist: parsed.data.playlist,
      requested_best_of: parsed.data.bestOf,
      requested_ranked: parsed.data.ranked,
    });
    if (error) throw error;
    return apiSuccess(data, 201, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/invitations");
  }
}

export async function PATCH(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? invitationResponseSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Invitation response is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("respond_duel_invitation", {
      requested_invitation_id: parsed.data.invitationId,
      requested_accept: parsed.data.accept,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/invitations:respond");
  }
}
