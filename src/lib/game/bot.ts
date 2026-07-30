import { calculateScore } from "./scoring";
import type { Score } from "./types";

export type BotPerformance = {
  selectedCells: number[];
  score: Score;
  completionTimeMs: number;
};

export function simulatePracticeBot(
  seed: string | number | bigint,
  highlightedCells: readonly number[],
  cellCount = 16,
): BotPerformance {
  const numeric = BigInt(seed);
  const correctCount = 3 + Number(numeric % 4n);
  const selected = highlightedCells.slice(0, correctCount);
  if (numeric % 3n === 0n) {
    const wrong = Array.from({ length: cellCount }, (_, index) => index).find(
      (cell) => !highlightedCells.includes(cell),
    );
    if (wrong !== undefined) selected.push(wrong);
  }
  const completionTimeMs = 4_200 + Number(numeric % 3_700n);
  return {
    selectedCells: selected,
    score: calculateScore(highlightedCells, selected),
    completionTimeMs,
  };
}
