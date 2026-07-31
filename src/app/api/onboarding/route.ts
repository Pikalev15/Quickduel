import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson, rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { onboardingSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? onboardingSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Onboarding state is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("set_onboarding_state", {
      requested_completed: parsed.data.completed,
      requested_skipped: parsed.data.skipped,
      requested_recommendation: parsed.data.recommendation,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/onboarding");
  }
}
