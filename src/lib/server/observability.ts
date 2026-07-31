type LogLevel = "info" | "warn" | "error";

type LogContext = {
  correlationId: string;
  route: string;
  event: string;
  userId?: string | null;
  matchId?: string | null;
  durationMs?: number;
  error?: unknown;
  details?: Record<string, unknown>;
};

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };
  return {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
  };
}

export function structuredLog(level: LogLevel, context: LogContext) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "quickduel",
    deployment:
      process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    ...context,
    error: context.error ? serializeError(context.error) : undefined,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export async function reportServerError(context: LogContext) {
  structuredLog("error", context);
  const dsn = process.env.OBSERVABILITY_DSN;
  if (!dsn) return;
  try {
    await fetch(dsn, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "quickduel",
        correlationId: context.correlationId,
        route: context.route,
        event: context.event,
        error: serializeError(context.error),
      }),
      signal: AbortSignal.timeout(1_500),
    });
  } catch (reportingError) {
    structuredLog("warn", {
      correlationId: context.correlationId,
      route: context.route,
      event: "observability_delivery_failed",
      error: reportingError,
    });
  }
}
