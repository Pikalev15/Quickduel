import { apiError, apiSuccess, safeMessage } from "@/lib/api";
import { requireUser } from "@/lib/server/route";
import { matchIdSchema, submitAnswerSchema } from "@/lib/validation";

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
  const parsed = submitAnswerSchema.safeParse(body);
  if (!matchId.success || !parsed.success) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "Selected cells are invalid.",
      parsed.success ? undefined : parsed.error.issues,
    );
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("submit_match_answer", {
      requested_match_id: matchId.data,
      submitted_cells: parsed.data.selectedCells,
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
