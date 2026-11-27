/** Estimate server wall-clock offset using the midpoint of a bounded request.
 * This is a presentation estimate only; the server remains authoritative. */
export function estimateServerClockOffset(serverTimestamp: string | undefined, sentAt: number, receivedAt: number): number | null {
  if (!serverTimestamp) return null;
  const serverAt = Date.parse(serverTimestamp);
  const roundTrip = receivedAt - sentAt;
  if (!Number.isFinite(serverAt) || !Number.isFinite(roundTrip) || roundTrip < 0 || roundTrip > 2000) return null;
  return serverAt - (sentAt + roundTrip / 2);
}
