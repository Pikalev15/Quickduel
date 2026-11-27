import { describe, expect, it } from "vitest";
import { estimateServerClockOffset, submissionWindow } from "./game-clock";
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

describe("server submission receipt boundary", () => {
  it("allows only bounded transport tolerance for scored answers", () => {
    expect(submissionWindow(999, 1000, 8000, false, false)).toBe("not-open");
    expect(submissionWindow(9000, 1000, 8000, false, false)).toBe("open");
    expect(submissionWindow(10000, 1000, 8000, false, false)).toBe("open");
    expect(submissionWindow(10001, 1000, 8000, false, false)).toBe("expired");
    expect(submissionWindow(13000, 1000, 8000, true, false)).toBe("open");
    expect(submissionWindow(14001, 1000, 8000, true, false)).toBe("expired");
  });
  it("keeps deadline games and timeout markers from submitting prematurely", () => {
    expect(submissionWindow(8749, 1000, 8000, false, true)).toBe("too-early");
    expect(submissionWindow(8750, 1000, 8000, false, true)).toBe("open");
    expect(submissionWindow(8749, 1000, 8000, true, false)).toBe("too-early");
    expect(submissionWindow(9000, NaN, 8000, false, false)).toBe("invalid");
  });
});
