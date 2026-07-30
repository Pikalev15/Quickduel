import type { Challenge } from "./types";

const MODULUS = 2_147_483_647n;
const MULTIPLIER = 48_271n;

function normalizeSeed(seed: string | number | bigint) {
  const numeric = BigInt(seed);
  const normalized = ((numeric % MODULUS) + MODULUS) % MODULUS;
  return normalized === 0n ? 1n : normalized;
}

export function generateChallenge(
  seed: string | number | bigint,
  gridSize = 4,
  highlightCount = 6,
): Challenge {
  const cellCount = gridSize * gridSize;
  if (!Number.isInteger(gridSize) || gridSize < 2 || gridSize > 8) {
    throw new RangeError("Grid size must be an integer between 2 and 8.");
  }
  if (
    !Number.isInteger(highlightCount) ||
    highlightCount < 1 ||
    highlightCount >= cellCount
  ) {
    throw new RangeError("Highlight count must fit inside the grid.");
  }

  let state = normalizeSeed(seed);
  const cells = new Set<number>();
  while (cells.size < highlightCount) {
    state = (state * MULTIPLIER) % MODULUS;
    cells.add(Number(state % BigInt(cellCount)));
  }

  return {
    seed: String(seed),
    gridSize,
    highlightedCells: [...cells].sort((a, b) => a - b),
  };
}
