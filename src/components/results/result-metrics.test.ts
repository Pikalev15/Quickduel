import { describe, expect, it } from "vitest";
import { getGameResultMetric } from "./result-metrics";

function side(details: Record<string, number | string | boolean>) {
  return { correct: 0, incorrect: 0, details };
}

describe("game-specific result metrics", () => {
  it("shows order completion and actual order errors", () => {
    expect(getGameResultMetric("Number Order", side({ errors: 0 }))).toBe(
      "10/10 ordered · 0 order errors",
    );
    expect(getGameResultMetric("Number Order", side({ errors: 2 }))).toBe(
      "10/10 ordered · 2 order errors",
    );
  });

  it("uses each game's meaningful discrete result counts", () => {
    expect(
      getGameResultMetric(
        "Memory Grid",
        side({ correct: 5, incorrect: 1, missed: 1 }),
      ),
    ).toBe("1 wrong cell · 1 missed cell");
    expect(
      getGameResultMetric(
        "Pattern Complete",
        side({ correct: 4, incorrect: 2 }),
      ),
    ).toBe("2 wrong answers");
    expect(
      getGameResultMetric(
        "Reaction Test",
        side({ averageMs: 320, falseStarts: 1 }),
      ),
    ).toBe("1 false start");
    expect(
      getGameResultMetric("Target Tap", side({ hits: 12, misses: 0 })),
    ).toBe("12 hits · 0 misses");
    expect(
      getGameResultMetric("Target Tap", side({ hits: 11, misses: 1 })),
    ).toBe("11 hits · 1 miss");
  });

  it("leaves continuous-error and summary-scored games to their own result summary", () => {
    const summaryOnlyGames = [
      "Frequency Recall",
      "Colour Recall",
      "Time Recall",
      "Shape Recall",
      "Rhythm Recall",
      "Dot Estimate",
      "Odd One Out",
    ];
    for (const gameName of summaryOnlyGames) {
      expect(getGameResultMetric(gameName, side({}))).toBeUndefined();
    }
  });

  it("does not invent zero metrics when expected details are missing", () => {
    expect(getGameResultMetric("Number Order", side({}))).toBeUndefined();
    expect(getGameResultMetric("Memory Grid", side({ correct: 0 }))).toBeUndefined();
  });

  it("leaves Typing Sprint to its preserved correct and incorrect character display", () => {
    expect(
      getGameResultMetric(
        "Typing Sprint",
        side({ correct: 120, incorrect: 4, grossWpm: 53 }),
      ),
    ).toBeUndefined();
  });
});
