import { apiError, apiSuccess, requestCorrelationId } from "@/lib/api";
import { readJson, rpcErrorResponse } from "@/lib/server/http";
import { requireUser } from "@/lib/server/route";
import {
  friendActionSchema,
  friendRequestSchema,
  friendResponseSchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = requestCorrelationId(request);
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("get_friends_state");
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/friends");
  }
}

export async function POST(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? friendRequestSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Friend request is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("send_friend_request", {
      requested_public_code: parsed.data.publicCode,
    });
    if (error) throw error;
    return apiSuccess(data, 201, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/friends:request");
  }
}

export async function PATCH(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? friendResponseSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Friend response is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("respond_friend_request", {
      requested_request_id: parsed.data.requestId,
      requested_accept: parsed.data.accept,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/friends:respond");
  }
}

export async function DELETE(request: Request) {
  const correlationId = requestCorrelationId(request);
  const body = await readJson(request);
  const parsed = body.ok ? friendActionSchema.safeParse(body.value) : null;
  if (!parsed?.success) {
    return apiError(400, "INVALID_REQUEST", "Friend action is invalid.", parsed?.error.issues, correlationId);
  }
  try {
    const { supabase } = await requireUser();
    const rpc = parsed.data.action === "block" ? "block_player" : "remove_friend";
    const { data, error } = await supabase.rpc(rpc, {
      requested_public_code: parsed.data.publicCode,
    });
    if (error) throw error;
    return apiSuccess(data, 200, correlationId);
  } catch (error) {
    return rpcErrorResponse(error, correlationId, "/api/friends:action");
  }
}
