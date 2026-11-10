type ResultMetricSide = {
  correct: number;
  incorrect: number;
  summary?: string;
  details?: Record<string, number | string | boolean>;
};

function numericDetail(side: ResultMetricSide, key: string): number | undefined {
  const value = side.details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Result summaries already carry the useful comparison for continuous-error
 * games. This adds a second line only where the game has an intuitive count
 * or a useful metric that the summary does not already communicate.
 */
export function getGameResultMetric(
  gameName: string | undefined,
  side: ResultMetricSide,
): string | undefined {
  switch (gameName) {
    case "Memory Grid": {
      const correct = numericDetail(side, "correct");
      const incorrect = numericDetail(side, "incorrect");
      const missed = numericDetail(side, "missed");
      if (correct === undefined || incorrect === undefined || missed === undefined) return;
      return `${countLabel(incorrect, "wrong cell")} · ${countLabel(missed, "missed cell")}`;
    }
    case "Number Order": {
      const errors = numericDetail(side, "errors");
      if (errors === undefined) return;
      return `10/10 ordered · ${countLabel(errors, "order error")}`;
    }
    case "Pattern Complete": {
      const incorrect = numericDetail(side, "incorrect");
      if (incorrect === undefined) return;
      return `${countLabel(incorrect, "wrong answer")}`;
    }
    case "Reaction Test": {
      const falseStarts = numericDetail(side, "falseStarts");
      if (falseStarts === undefined) return;
      return `${countLabel(falseStarts, "false start")}`;
    }
    case "Target Tap": {
      const hits = numericDetail(side, "hits");
      const misses = numericDetail(side, "misses");
      if (hits === undefined || misses === undefined) return;
      return `${countLabel(hits, "hit")} · ${countLabel(misses, "miss", "misses")}`;
    }
    // Typing Sprint keeps its established correct/incorrect character counts.
    // The remaining games use the game-specific summary above the metric row
    // (for example, timing error or dots off) or a five-round score breakdown.
    default:
      return;
  }
}
