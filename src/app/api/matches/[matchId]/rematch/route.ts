import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema, rematchRequestSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const matchId = matchIdSchema.safeParse((await context.params).matchId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_REQUEST", "Request body must be JSON.");
  }
  const parsed = rematchRequestSchema.safeParse(body);
  if (!matchId.success || !parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Rematch request is invalid.");
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("request_rematch", {
      requested_match_id: matchId.data,
    });
    if (error) return apiError(409, "CONFLICT", error.message);
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
