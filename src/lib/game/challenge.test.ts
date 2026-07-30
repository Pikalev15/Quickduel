import { describe, expect, it } from "vitest";
import { generateChallenge } from "./challenge";

describe("generateChallenge", () => {
  it("is deterministic", () => {
    expect(generateChallenge("123456")).toEqual(generateChallenge("123456"));
  });

  it("produces different valid challenges for different seeds", () => {
    const first = generateChallenge("123456");
    const second = generateChallenge("654321");
    expect(first.highlightedCells).not.toEqual(second.highlightedCells);
    expect(first.highlightedCells).toHaveLength(6);
    expect(new Set(first.highlightedCells).size).toBe(6);
    expect(first.highlightedCells.every((cell) => cell >= 0 && cell < 16)).toBe(
      true,
    );
  });
});
