import { NextResponse } from "next/server";
export type ApiErrorCode =
  | "BACKEND_NOT_CONFIGURED"
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "SERVER_ERROR";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
  correlationId?: string,
) {
  const id = correlationId ?? crypto.randomUUID();
  return NextResponse.json(
    { ok: false, error: { code, message, details, correlationId: id } },
    { status, headers: { "x-correlation-id": id } },
  );
}

export function apiSuccess<T>(data: T, status = 200, correlationId?: string) {
  const id = correlationId ?? crypto.randomUUID();
  return NextResponse.json(
    { ok: true, data, correlationId: id },
    { status, headers: { "x-correlation-id": id } },
  );
}

export function safeMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("not configured")) {
    return "QuickDuel backend is not configured yet.";
  }
  return "Something went wrong. Please try again.";
}

export function requestCorrelationId(request?: Request) {
  const supplied = request?.headers.get("x-correlation-id");
  return supplied && /^[A-Za-z0-9_-]{8,100}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
}
