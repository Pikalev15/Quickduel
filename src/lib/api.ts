import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export type ApiErrorCode =
  | "BACKEND_NOT_CONFIGURED"
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "SERVER_ERROR";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: ZodError["issues"],
) {
  return NextResponse.json(
    { ok: false, error: { code, message, details } },
    { status },
  );
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function safeMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("not configured")) {
    return "QuickDuel backend is not configured yet.";
  }
  return "Something went wrong. Please try again.";
}
