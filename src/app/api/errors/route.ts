import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson } from "@/lib/server/http";
import { reportServerError } from "@/lib/server/observability";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientErrorSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? clientErrorSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Error report is invalid.", parsed?.error.issues, correlationId);
  }
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    // Error reporting remains available when auth configuration itself fails.
  }
  await reportServerError({
    correlationId,
    route: parsed.data.route,
    event: parsed.data.event,
    userId,
    error: new Error(parsed.data.message),
    details: {
      digest: parsed.data.digest,
      stack: process.env.NODE_ENV === "development" ? parsed.data.stack : undefined,
    },
  });
  return apiSuccess({ accepted: true }, 202, correlationId);
}
