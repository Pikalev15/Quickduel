import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { duelCodeSchema } from "@/lib/validation";

async function codeFrom(context: { params: Promise<{ code: string }> }) {
  return duelCodeSchema.safeParse((await context.params).code);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const code = await codeFrom(context);
  if (!code.success) {
    return apiError(400, "INVALID_REQUEST", "That duel code is invalid.", code.error.issues, correlationId);
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_private_duel", {
      requested_code: code.data,
    });
    if (error) throw error;
    if (!data) return apiError(404, "NOT_FOUND", "Private duel not found.", undefined, correlationId);
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/duels/[code]");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const code = await codeFrom(context);
  if (!code.success) {
    return apiError(400, "INVALID_REQUEST", "That duel code is invalid.", code.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("join_private_duel", {
      requested_code: code.data,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/duels/[code]:join");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const correlationId = requestCorrelationId(request);
  const code = await codeFrom(context);
  if (!code.success) {
    return apiError(400, "INVALID_REQUEST", "That duel code is invalid.", code.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("leave_private_duel", {
      requested_code: code.data,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/duels/[code]:leave");
  }
}
