/** Same count and threshold as get_my_rank_eligibility(). */
export const PLACEMENT_MATCHES = 5;
export function getPlacement(matchesPlayed: number | null | undefined) {
  if (typeof matchesPlayed !== "number" || !Number.isFinite(matchesPlayed) || matchesPlayed < 0) return null;
  const completed = Math.min(PLACEMENT_MATCHES, Math.floor(matchesPlayed));
  return { completed, required: PLACEMENT_MATCHES, remaining: PLACEMENT_MATCHES - completed, placed: completed === PLACEMENT_MATCHES };
}
