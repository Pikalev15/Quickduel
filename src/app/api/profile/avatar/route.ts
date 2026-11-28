import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { rpcErrorResponse } from "@/lib/server/http";
import { enforceNetworkAbuseBoundary } from "@/lib/server/network-abuse";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeAvatar } from "@/lib/server/avatar-image";

export const runtime = "nodejs";

async function change(request: Request, remove: boolean) {
  const id = requestCorrelationId(request);
  try {
    const { user, supabase } = await requireUser();
    await enforceNetworkAbuseBoundary(request,"avatar_update",30,3600,{adaptiveChallenge:false});
    const limited = await supabase.rpc("check_rate_limit",{requested_action:"profile_update",requested_limit:6,requested_window_seconds:3600});
    if (limited.error) throw limited.error;
    if (limited.data !== true) return apiError(429,"RATE_LIMITED","Too many profile updates.",undefined,id);
    let encoded: string | null = null;
    if (!remove) {
      try { encoded = (await normalizeAvatar(request)).toString("base64"); }
      catch { return apiError(400,"INVALID_REQUEST","Choose a valid JPEG, PNG or WebP up to 2 MB and 16 megapixels.",undefined,id); }
    }
    const { error } = await createSupabaseAdminClient().rpc("set_player_avatar",{requested_profile_id:user.id,requested_image:encoded});
    if (error) throw error;
    return apiSuccess({updated:true},200,id);
  } catch(error) {
    return rpcErrorResponse(error,id,"/api/profile/avatar");
  }
}
export function POST(request: Request) { return change(request,false); }
export function DELETE(request: Request) { return change(request,true); }
