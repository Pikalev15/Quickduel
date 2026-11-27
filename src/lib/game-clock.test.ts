import { describe, expect, it } from "vitest";
import { estimateServerClockOffset } from "./game-clock";
const iso = (n: number) => new Date(n).toISOString();
describe("game clock synchronization", () => {
  it("removes 800ms processing from a 100ms each-way request", () => {
    expect(estimateServerClockOffset(iso(1900), 1000, 2000, iso(1100))).toBe(0);
  });
  it("corrects clocks ahead of and behind the server, even with slow processing", () => {
    expect(estimateServerClockOffset(iso(11900), 1000, 2000, iso(11100))).toBe(10000);
    expect(estimateServerClockOffset(iso(1900), 11000, 12000, iso(1100))).toBe(-10000);
    expect(estimateServerClockOffset(iso(6100), 1000, 6200, iso(1100))).toBe(0);
  });
  it("rejects missing, invalid, reversed and excessive network delays", () => {
    expect(estimateServerClockOffset(iso(1900), 1000, 2000)).toBeNull();
    expect(estimateServerClockOffset("invalid", 1000, 2000, iso(1100))).toBeNull();
    expect(estimateServerClockOffset(iso(1900), 2000, 1000, iso(1100))).toBeNull();
    expect(estimateServerClockOffset(iso(1100), 1000, 2000, iso(1900))).toBeNull();
    expect(estimateServerClockOffset(iso(1900), 1000, 4500, iso(1100))).toBeNull();
  });
});
