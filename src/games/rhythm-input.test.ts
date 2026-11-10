import { describe, expect, it } from "vitest";
import { appendRhythmTap, haveAllRhythmTaps } from "./rhythm-input";

describe("rhythm tap input", () => {
  it("caps each round at its generated beat count", () => {
    const fiveBeatRun = Array.from({ length: 5 }, (_, index) => index * 300);
    const taps = [fiveBeatRun, [], []];

    expect(appendRhythmTap(taps, 0, 1800, 5)).toEqual({ taps, accepted: false });
    expect(appendRhythmTap(taps, 1, 300, 7)).toEqual({
      taps: [fiveBeatRun, [300], []],
      accepted: true,
    });
  });

  it("marks the run ready only when every generated beat has one tap", () => {
    const targetCounts = [5, 6, 7];
    const completeTaps = targetCounts.map((count) =>
      Array.from({ length: count }, (_, index) => index * 250),
    );
    const partialTaps = [completeTaps[0], completeTaps[1].slice(0, 5), completeTaps[2]];
    expect(haveAllRhythmTaps(partialTaps, targetCounts)).toBe(false);
    expect(haveAllRhythmTaps(completeTaps, targetCounts)).toBe(true);
  });
});
