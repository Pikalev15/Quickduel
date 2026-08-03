import { apiError } from "../api";

export type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

type DomainErrorDefinition = {
  status: number;
  apiCode:
    | "UNAUTHENTICATED"
    | "INVALID_REQUEST"
    | "NOT_FOUND"
    | "CONFLICT"
    | "FORBIDDEN"
    | "RATE_LIMITED";
  message: string;
  abuseSignal?: "duplicate_submission";
  logLevel: "info" | "warn";
};

const DOMAIN_ERRORS: Record<string, DomainErrorDefinition> = {
  QD_UNAUTHENTICATED: {
    status: 401,
    apiCode: "UNAUTHENTICATED",
    message: "Start or restore your session.",
    logLevel: "info",
  },
  QD_FORBIDDEN: {
    status: 403,
    apiCode: "FORBIDDEN",
    message: "You do not have access to this action.",
    logLevel: "warn",
  },
  QD_MATCH_NOT_FOUND: {
    status: 404,
    apiCode: "NOT_FOUND",
    message: "Match not found.",
    logLevel: "info",
  },
  QD_MATCH_TERMINAL: {
    status: 409,
    apiCode: "CONFLICT",
    message: "This match has already ended.",
    logLevel: "info",
  },
  QD_ANSWER_NOT_OPEN: {
    status: 409,
    apiCode: "CONFLICT",
    message: "The answer phase has not started.",
    logLevel: "info",
  },
  QD_ANSWER_EXPIRED: {
    status: 409,
    apiCode: "CONFLICT",
    message: "The answer window has closed.",
    logLevel: "info",
  },
  QD_DUPLICATE_SUBMISSION: {
    status: 409,
    apiCode: "CONFLICT",
    message: "Your answer is already locked.",
    abuseSignal: "duplicate_submission",
    logLevel: "warn",
  },
  QD_INVALID_SUBMISSION: {
    status: 400,
    apiCode: "INVALID_REQUEST",
    message: "Game submission is invalid.",
    logLevel: "info",
  },
  QD_ROUND_CLOSED: {
    status: 409,
    apiCode: "CONFLICT",
    message: "This round is already closed.",
    logLevel: "info",
  },
  QD_ROUND_ANSWER_NOT_OPEN: {
    status: 409,
    apiCode: "CONFLICT",
    message: "This round is still revealing its stimulus.",
    logLevel: "info",
  },
  QD_DUPLICATE_ROUND_SUBMISSION: {
    status: 409,
    apiCode: "CONFLICT",
    message: "Your round answer is already locked.",
    abuseSignal: "duplicate_submission",
    logLevel: "warn",
  },
  QD_INVALID_ROUND_SUBMISSION: {
    status: 400,
    apiCode: "INVALID_REQUEST",
    message: "Round submission is invalid.",
    logLevel: "info",
  },
  QD_ROUND_TARGET_MISMATCH: {
    status: 409,
    apiCode: "CONFLICT",
    message: "The next round is synchronizing. Try again.",
    logLevel: "info",
  },
  QD_ROUND_TARGET_INVALID: {
    status: 409,
    apiCode: "CONFLICT",
    message: "The next round target is invalid.",
    logLevel: "warn",
  },
  QD_CHAT_INVALID: {
    status: 400,
    apiCode: "INVALID_REQUEST",
    message: "Chat messages must be between 1 and 280 characters.",
    logLevel: "info",
  },
  QD_CHAT_UNAVAILABLE: {
    status: 403,
    apiCode: "FORBIDDEN",
    message: "Chat is unavailable for this match.",
    logLevel: "warn",
  },
  QD_CHAT_CLOSED: {
    status: 409,
    apiCode: "CONFLICT",
    message: "Chat for this match is closed.",
    logLevel: "info",
  },
  QD_CHAT_LIMIT: {
    status: 429,
    apiCode: "RATE_LIMITED",
    message: "You have reached the message limit for this match.",
    logLevel: "warn",
  },
  QD_CHAT_MESSAGE_NOT_FOUND: {
    status: 404,
    apiCode: "NOT_FOUND",
    message: "Chat message not found.",
    logLevel: "info",
  },
  QD_CHAT_REPORT_INVALID: {
    status: 400,
    apiCode: "INVALID_REQUEST",
    message: "Report reason is invalid.",
    logLevel: "info",
  },
};

export function databaseDomainCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const candidate = error as DatabaseErrorLike;
  const detail = candidate.details?.trim();
  if (detail && DOMAIN_ERRORS[detail]) return detail;
  const message = candidate.message?.trim();
  return message && DOMAIN_ERRORS[message] ? message : null;
}

export function domainErrorResponse(
  error: unknown,
  correlationId: string,
) {
  const code = databaseDomainCode(error);
  if (!code) return null;
  const definition = DOMAIN_ERRORS[code];
  return apiError(
    definition.status,
    definition.apiCode,
    definition.message,
    { domainCode: code },
    correlationId,
  );
}

export function isDuplicateSubmission(error: unknown) {
  const code = databaseDomainCode(error);
  return code ? DOMAIN_ERRORS[code].abuseSignal === "duplicate_submission" : false;
}
