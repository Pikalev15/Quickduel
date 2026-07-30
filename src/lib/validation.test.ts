import { describe, expect, it } from "vitest";
import { selectedCellsSchema, submitAnswerSchema } from "./validation";

describe("selected cell validation", () => {
  it("rejects duplicates and malformed values", () => {
    expect(selectedCellsSchema.safeParse([1, 1]).success).toBe(false);
    expect(selectedCellsSchema.safeParse([-1]).success).toBe(false);
    expect(selectedCellsSchema.safeParse(["1"]).success).toBe(false);
    expect(selectedCellsSchema.safeParse([]).success).toBe(false);
  });
});

describe("answer submission validation", () => {
  it("defaults normal answers to not timed out", () => {
    expect(
      submitAnswerSchema.parse({ submission: { order: [0, 1] } }),
    ).toEqual({
      submission: { order: [0, 1] },
      timedOut: false,
    });
  });

  it("accepts an explicit deadline submission", () => {
    expect(
      submitAnswerSchema.safeParse({ submission: {}, timedOut: true }).success,
    ).toBe(true);
  });
});
