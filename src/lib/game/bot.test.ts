import { describe, expect, it } from "vitest";
import { simulatePracticeBot } from "./bot";

describe("Practice Bot", () => {
  it("is deterministic, plausible, and isolated from rating", () => {
    const expected = [0, 2, 4, 7, 11, 14];
    const first = simulatePracticeBot("123", expected);
    expect(first).toEqual(simulatePracticeBot("123", expected));
    expect(first.completionTimeMs).toBeGreaterThanOrEqual(4_200);
    expect(first.completionTimeMs).toBeLessThan(8_000);
    expect(first).not.toHaveProperty("ratingDelta");
  });
});
