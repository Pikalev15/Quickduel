import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const confirmationSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = confirmationSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "INVALID_REQUEST", "Type DELETE to confirm account deletion.", parsed.error.issues, correlationId);
  }
  try {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.rpc("request_account_deletion");
    if (error) throw error;
    const admin = createSupabaseAdminClient();
    const { error: deletionError } = await admin.auth.admin.deleteUser(user.id, true);
    if (deletionError) throw deletionError;
    return apiSuccess({ deleted: true }, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/account/delete");
  }
}
