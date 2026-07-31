import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson, rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { cosmeticEquipSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_cosmetics");
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/cosmetics");
  }
}

export async function PATCH(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? cosmeticEquipSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Cosmetic selection is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("equip_cosmetic", {
      requested_cosmetic_id: parsed.data.cosmeticId,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/cosmetics:equip");
  }
}
