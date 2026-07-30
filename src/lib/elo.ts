import type { Outcome } from "./game/types";

export const STARTING_RATING = 1_000;
export const ELO_K_FACTOR = 32;
export const MIN_RATING = 100;
export const MAX_RATING = 4_000;

export function expectedScore(rating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function ratingDelta(
  rating: number,
  opponentRating: number,
  outcome: Outcome,
  kFactor = ELO_K_FACTOR,
) {
  const actual = outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
  return Math.round(kFactor * (actual - expectedScore(rating, opponentRating)));
}

export function clampRating(rating: number) {
  if (!Number.isFinite(rating)) {
    throw new TypeError("Rating must be finite.");
  }
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(rating)));
}

export function applyRating(
  rating: number,
  opponentRating: number,
  outcome: Outcome,
) {
  const next = clampRating(rating + ratingDelta(rating, opponentRating, outcome));
  return { rating: next, delta: next - rating };
}
