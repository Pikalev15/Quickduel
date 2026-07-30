import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema } from "@/lib/validation";

export async function POST(
  _request: Request,
  context: { params: Promise<{ matchId: string }> },
) {
  const parsed = matchIdSchema.safeParse((await context.params).matchId);
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "That match link is invalid.");
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("mark_match_ready", {
      requested_match_id: parsed.data,
    });
    if (error) {
      return apiError(409, "CONFLICT", error.message);
    }
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
