/** Four timestamps: client send, server receive, server send, client receive.
 * Remove server processing from the network round trip before estimating skew.
 * Never infer an offset from an incomplete or implausible sample. */
export function estimateServerClockOffset(serverTimestamp: string | undefined, sentAt: number, receivedAt: number, serverReceivedTimestamp?: string): number | null {
  if (!serverTimestamp || !serverReceivedTimestamp) return null;
  const serverSentAt = Date.parse(serverTimestamp);
  const serverReceivedAt = Date.parse(serverReceivedTimestamp);
  const processing = serverSentAt - serverReceivedAt;
  const networkRoundTrip = receivedAt - sentAt - processing;
  if (![serverSentAt, serverReceivedAt, sentAt, receivedAt].every(Number.isFinite) ||
      receivedAt < sentAt || processing < 0 || networkRoundTrip < 0 || networkRoundTrip > 2000) return null;
  return ((serverReceivedAt - sentAt) + (serverSentAt - receivedAt)) / 2;
}

export const MATCH_RECEIPT_TOLERANCE_MS = 1000;
export function submissionWindow(
  receivedAt: number,
  answerStartedAt: number,
  answerDurationMs: number,
  timedOut: boolean,
  submitAtDeadline: boolean,
): "not-open" | "expired" | "too-early" | "invalid" | "open" {
  if (![receivedAt, answerStartedAt, answerDurationMs].every(Number.isFinite) || answerDurationMs <= 0) return "invalid";
  const deadline = answerStartedAt + answerDurationMs;
  if (receivedAt < answerStartedAt) return "not-open";
  if (receivedAt > deadline + (timedOut ? 5000 : MATCH_RECEIPT_TOLERANCE_MS)) return "expired";
  if ((timedOut || submitAtDeadline) && receivedAt < deadline - 250) return "too-early";
  return "open";
}

export function formatQueueElapsed(seconds: number): string {
  const elapsed = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
}
