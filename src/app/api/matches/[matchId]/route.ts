import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { matchIdSchema } from "@/lib/validation";
import { requireUser } from "@/lib/server/route";

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
    return apiSuccess(data);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return apiError(401, "UNAUTHENTICATED", "Your session expired.");
    }
    return apiError(500, "SERVER_ERROR", safeMessage(error));
  }
}
