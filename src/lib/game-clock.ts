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
