import { describe, it, expect } from "vitest";
import { getGame } from "./registry";

describe("rhythm server validation", () => {
  const game = getGame("rhythm_recall");
  const challenge = game.generate("rhythm-validation");
  const rhythms = challenge.rhythms as number[][];
  it("accepts exact generated rhythms and valid bots", () => {
    expect(game.validateSubmission?.(challenge, { tapsMs: rhythms })).toBe(true);
    expect(game.calculate(challenge, { tapsMs: rhythms }, 1000).accuracy).toBe(1);
    expect(game.validateSubmission?.(challenge, game.bot("bot", challenge).submission)).toBe(true);
  });
  it("rejects wrong beat counts, duplicate and backward taps", () => {
    const withFirst = (first: number[]) => ({ tapsMs: [first, ...rhythms.slice(1)] });
    expect(game.validateSubmission?.(challenge, withFirst(rhythms[0].slice(1)))).toBe(false);
    expect(game.validateSubmission?.(challenge, withFirst(rhythms[0].map(() => 0)))).toBe(false);
    expect(game.validateSubmission?.(challenge, withFirst([...rhythms[0]].reverse()))).toBe(false);
    expect(Number.isFinite(game.calculate(challenge, withFirst(rhythms[0].map(() => 0)), 1000).rankScore)).toBe(true);
  });
});
