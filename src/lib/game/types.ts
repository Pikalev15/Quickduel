export const GRID_SIZE = 4;
export const HIGHLIGHT_COUNT = 6;
export const REVEAL_DURATION_MS = 1_750;
export const ANSWER_DURATION_MS = 12_000;

export type Challenge = {
  seed: string;
  gridSize: number;
  highlightedCells: number[];
};

export type Score = {
  correct: number;
  incorrect: number;
  missed: number;
  value: number;
};

export type Outcome = "win" | "loss" | "draw";
