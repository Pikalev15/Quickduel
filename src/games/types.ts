import type { z } from "zod";

export const GAME_IDS = [
  "memory_grid",
  "frequency_recall",
  "colour_recall",
  "time_recall",
  "shape_recall",
  "rhythm_recall",
  "dot_estimate",
  "number_order",
  "odd_one_out",
  "pattern_complete",
  "reaction_test",
  "target_tap",
] as const;

export type GameId = (typeof GAME_IDS)[number];
export type GameCategory = "sensory" | "mind" | "experimental";
export type PlaylistId = "quick" | GameCategory;
export type Challenge = Record<string, unknown>;
export type Submission = Record<string, unknown>;
export type GamePhase = "waiting" | "countdown" | "reveal" | "answer" | "result";

export type GameResult = {
  rankScore: number;
  accuracy: number;
  summary: string;
  details: Record<string, number | string | boolean>;
};

export type GameComponentProps = {
  challenge: Challenge;
  disabled?: boolean;
  onChange: (submission: Submission, canSubmit: boolean) => void;
};

export type GameDefinition = {
  id: GameId;
  version: 1;
  name: string;
  shortName: string;
  category: GameCategory;
  description: string;
  instructions: string;
  ranked: boolean;
  revealDurationMs: number;
  answerDurationMs: number;
  submissionSchema: z.ZodType<Submission>;
  generate: (seed: string) => Challenge;
  publicChallenge: (challenge: Challenge, phase: GamePhase) => Challenge;
  calculate: (
    challenge: Challenge,
    submission: Submission,
    completionTimeMs: number,
  ) => GameResult;
  bot: (seed: string, challenge: Challenge) => {
    submission: Submission;
    completionTimeMs: number;
  };
};

export type DuelOutcome = "win" | "loss" | "draw";

export function compareGameResults(
  first: GameResult,
  firstTimeMs: number,
  second: GameResult,
  secondTimeMs: number,
): DuelOutcome {
  if (Math.abs(first.rankScore - second.rankScore) > 0.000_001) {
    return first.rankScore > second.rankScore ? "win" : "loss";
  }
  if (Math.abs(firstTimeMs - secondTimeMs) <= 10) return "draw";
  return firstTimeMs < secondTimeMs ? "win" : "loss";
}
