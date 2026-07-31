import type { z } from "zod";

export const GAME_IDS = [
  "memory_grid",
  "frequency_recall",
  "frequency_recall_v2",
  "colour_recall",
  "colour_recall_v2",
  "time_recall",
  "shape_recall",
  "rhythm_recall",
  "dot_estimate",
  "number_order",
  "odd_one_out",
  "pattern_complete",
  "typing_sprint",
  "reaction_test",
  "target_tap",
] as const;

export type GameId = (typeof GAME_IDS)[number];
export const ACTIVE_GAME_IDS = [
  "memory_grid",
  "frequency_recall_v2",
  "colour_recall_v2",
  "time_recall",
  "shape_recall",
  "rhythm_recall",
  "dot_estimate",
  "number_order",
  "odd_one_out",
  "pattern_complete",
  "typing_sprint",
  "reaction_test",
  "target_tap",
] as const satisfies readonly GameId[];
export type ActiveGameId = (typeof ACTIVE_GAME_IDS)[number];
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
  phaseElapsedMs?: number;
  onChange: (submission: Submission, canSubmit: boolean) => void;
};

export type GameDefinition = {
  id: GameId;
  version: number;
  name: string;
  shortName: string;
  category: GameCategory;
  description: string;
  instructions: string;
  ranked: boolean;
  revealDurationMs: number;
  answerDurationMs: number;
  autoSubmitOnValid?: boolean;
  submitAtDeadline?: boolean;
  submissionSchema: z.ZodType<Submission>;
  validateSubmission?: (challenge: Challenge, submission: Submission) => boolean;
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
  if (Math.abs(first.accuracy - second.accuracy) > 0.000_1) {
    return first.accuracy > second.accuracy ? "win" : "loss";
  }
  const firstCorrect = Number(first.details.correct ?? 0);
  const secondCorrect = Number(second.details.correct ?? 0);
  if (firstCorrect !== secondCorrect) {
    return firstCorrect > secondCorrect ? "win" : "loss";
  }
  const firstIncorrect = Number(first.details.incorrect ?? 0);
  const secondIncorrect = Number(second.details.incorrect ?? 0);
  if (firstIncorrect !== secondIncorrect) {
    return firstIncorrect < secondIncorrect ? "win" : "loss";
  }
  if (Math.abs(firstTimeMs - secondTimeMs) <= 10) return "draw";
  return firstTimeMs < secondTimeMs ? "win" : "loss";
}
