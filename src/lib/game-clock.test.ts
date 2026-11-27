import { describe, expect, it } from "vitest";
import { estimateServerClockOffset } from "./game-clock";

describe("game clock synchronization", () => {
  it("corrects device clocks ahead of and behind the server", () => {
    expect(estimateServerClockOffset(new Date(10_000).toISOString(), 20_000, 20_200)).toBe(-10_100);
    expect(estimateServerClockOffset(new Date(10_000).toISOString(), 1_000, 1_200)).toBe(8_900);
  });
  it("ignores invalid, missing, reversed and excessively delayed samples", () => {
    expect(estimateServerClockOffset(undefined, 1_000, 1_200)).toBeNull();
    expect(estimateServerClockOffset("invalid", 1_000, 1_200)).toBeNull();
    expect(estimateServerClockOffset(new Date(10_000).toISOString(), 1_200, 1_000)).toBeNull();
    expect(estimateServerClockOffset(new Date(10_000).toISOString(), 1_000, 4_000)).toBeNull();
  });
});
