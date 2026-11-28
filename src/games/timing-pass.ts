// Initial playtest budgets, not final balance.
export const REACTION_ATTEMPTS = 5;
export const REACTION_WAIT_MIN_MS = 1500;
export const REACTION_WAIT_MAX_MS = 3500;
export const REACTION_TAP_MS = 1250;
export const REACTION_DURATION_MS = 26_000;
export const FREQUENCY_DUEL_MS = 71_000;
export const FREQUENCY_ANSWER_MS = 8_200;
export const FREQUENCY_FEEDBACK_MS = 2_000;
export const CRYPTIC_DURATION_MS = 40_000;
export function median(values: number[]) {
  const ordered = [...values].sort((a,b)=>a-b);
  const middle = Math.floor(ordered.length/2);
  return ordered.length ? ordered.length%2 ? ordered[middle] : (ordered[middle-1]+ordered[middle])/2 : 0;
}
