import type { Outcome, Score } from "./types";

export const INCORRECT_SELECTION_PENALTY = 0.5;
export const EFFECTIVE_TIME_TIE_MS = 10;

export function calculateScore(
  expectedCells: readonly number[],
  selectedCells: readonly number[],
): Score {
  const expected = new Set(expectedCells);
  const selected = new Set(selectedCells);
  let correct = 0;

  for (const cell of selected) {
    if (expected.has(cell)) correct += 1;
  }

  const incorrect = selected.size - correct;
  return {
    correct,
    incorrect,
    missed: expected.size - correct,
    value: correct - incorrect * INCORRECT_SELECTION_PENALTY,
  };
}

export function compareScores(
  first: Score,
  firstTimeMs: number,
  second: Score,
  secondTimeMs: number,
): Outcome {
  if (first.value !== second.value) {
    return first.value > second.value ? "win" : "loss";
  }
  if (Math.abs(firstTimeMs - secondTimeMs) <= EFFECTIVE_TIME_TIE_MS) {
    return "draw";
  }
  return firstTimeMs < secondTimeMs ? "win" : "loss";
}
