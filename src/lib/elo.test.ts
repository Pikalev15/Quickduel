import { describe, expect, it } from "vitest";
import { applyRating, expectedScore, ratingDelta } from "./elo";

describe("Elo", () => {
  it("calculates expected score", () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it("calculates win, loss, and draw", () => {
    expect(applyRating(1000, 1000, "win")).toEqual({
      rating: 1016,
      delta: 16,
    });
    expect(applyRating(1000, 1000, "loss")).toEqual({
      rating: 984,
      delta: -16,
    });
    expect(applyRating(1000, 1000, "draw")).toEqual({
      rating: 1000,
      delta: 0,
    });
  });

  it("is symmetrical within rounding expectations", () => {
    const winner = ratingDelta(1180, 1040, "win");
    const loser = ratingDelta(1040, 1180, "loss");
    expect(winner + loser).toBe(0);
  });
});
