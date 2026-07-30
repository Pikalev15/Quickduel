import { describe, expect, it } from "vitest";
import { calculateScore, compareScores } from "./scoring";

describe("Memory Grid scoring", () => {
  it("counts correct answers", () => {
    expect(calculateScore([0, 1, 2], [0, 2])).toEqual({
      correct: 2,
      incorrect: 0,
      missed: 1,
      value: 2,
    });
  });

  it("penalizes incorrect selections", () => {
    expect(calculateScore([0, 1, 2], [0, 2, 5]).value).toBe(1.5);
  });

  it("uses completion time and supports effective ties", () => {
    const score = calculateScore([0, 1], [0, 1]);
    expect(compareScores(score, 500, score, 505)).toBe("draw");
    expect(compareScores(score, 500, score, 700)).toBe("win");
  });
});
