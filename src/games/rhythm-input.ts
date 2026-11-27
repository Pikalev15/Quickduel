export const RHYTHM_COUNT = 3;
export const RHYTHM_MIN_TAPS = 5;
export const RHYTHM_MAX_TAPS = 7;
export const RHYTHM_MIN_INTERVAL_MS = 180;
export const RHYTHM_MAX_INTERVAL_MS = 620;
export const RHYTHM_SEQUENCE_GAP_MS = 550;
// Three maximum-length sequences, two inter-sequence gaps, and the final
// 80ms tone tail fit inside the reveal before answer input opens.
export const RHYTHM_REVEAL_DURATION_MS = 13_000;

export function appendRhythmTap(
  taps: number[][],
  round: number,
  elapsedMs: number,
  tapLimit: number,
) {
  if (round < 0 || round >= taps.length || taps[round].length >= tapLimit) {
    return { taps, accepted: false };
  }
  const previous = taps[round].at(-1);
  const next = Math.round(elapsedMs);
  if (!Number.isFinite(next) || next < 0 || next > 10000 ||
      (previous === undefined ? next !== 0 : next <= previous)) {
    return { taps, accepted: false };
  }
  return {
    taps: taps.map((values, index) =>
      index === round ? [...values, next] : values,
    ),
    accepted: true,
  };
}

export function haveAllRhythmTaps(taps: number[][], targetTapCounts: number[]) {
  return targetTapCounts.length > 0 && targetTapCounts.every(
    (count, index) => taps[index]?.length === count,
  );
}
