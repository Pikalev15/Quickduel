import { apiError, safeMessage } from "@/lib/api";
import { reportServerError, structuredLog } from "./observability";
import { domainErrorResponse } from "./domain-errors";
import { AdaptiveChallengeRequired } from "./network-abuse";

function failureEvent(route: string) {
  if (route.includes("matchmaking")) return "matchmaking_failure";
  if (route.includes("/duels")) return "private_duel_failure";
  if (route.includes("/share")) return "share_card_failure";
  if (route.includes("auth")) return "auth_failure";
  return "rpc_failure";
}

export function rpcErrorResponse(
  error: unknown,
  correlationId: string,
  route: string,
) {
  if (error instanceof AdaptiveChallengeRequired) {
    return apiError(
      403,
      "FORBIDDEN",
      "Complete the verification check to continue.",
      {
        challengeRequired: true,
        provider: "turnstile",
        siteKey: error.siteKey,
      },
      correlationId,
    );
  }
  const domainResponse = domainErrorResponse(error, correlationId);
  if (domainResponse) return domainResponse;
  const message = error instanceof Error ? error.message : String(error);
  const event = failureEvent(route);
  if (message === "UNAUTHENTICATED" || /Authentication required/i.test(message)) {
    structuredLog("warn", { correlationId, route, event: "auth_failure", error });
    return apiError(401, "UNAUTHENTICATED", "Start or restore your session.", undefined, correlationId);
  }
  if (/Admin access required|Analytics access required/i.test(message)) {
    structuredLog("warn", { correlationId, route, event, error, details: { status: 403 } });
    return apiError(403, "FORBIDDEN", "You do not have access to this area.", undefined, correlationId);
  }
  if (/Rate limit exceeded/i.test(message)) {
    structuredLog("warn", { correlationId, route, event, error, details: { status: 429 } });
    return apiError(429, "RATE_LIMITED", "Too many requests. Try again shortly.", undefined, correlationId);
  }
  if (message === "QD_NETWORK_RATE_LIMITED") {
    return apiError(
      429,
      "RATE_LIMITED",
      "Too many requests from this network. Try again shortly.",
      undefined,
      correlationId,
    );
  }
  if (/not found/i.test(message)) {
    return apiError(404, "NOT_FOUND", message, undefined, correlationId);
  }
  if (
    /already|unavailable|invalid|expired|full|restricted|cannot|require|pending|blocked/i.test(
      message,
    )
  ) {
    structuredLog("warn", { correlationId, route, event, error, details: { status: 409 } });
    return apiError(409, "CONFLICT", message, undefined, correlationId);
  }
  void reportServerError({
    correlationId,
    route,
    event,
    error,
  });
  return apiError(500, "SERVER_ERROR", safeMessage(error), undefined, correlationId);
}

export async function readJson(request: Request) {
  try {
    return { ok: true as const, value: (await request.json()) as unknown };
  } catch {
    return { ok: false as const, value: null };
  }
}
