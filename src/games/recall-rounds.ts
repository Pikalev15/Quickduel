import { z } from "zod";

export const SECURE_RECALL_GAME_IDS = [
  "frequency_recall_v2",
  "colour_recall_v2",
] as const;

export type SecureRecallGameId = (typeof SECURE_RECALL_GAME_IDS)[number];
export type RecallColour = { l: number; c: number; h: number };

export type FrequencyRoundFeedback = {
  kind: "frequency";
  targetHz: number;
  guessHz: number | null;
  differenceHz: number | null;
  percentError: number | null;
  centsError: number | null;
  direction: "high" | "low" | "exact" | "none";
  score: number;
  label: string;
};

export type ColourRoundFeedback = {
  kind: "colour";
  target: RecallColour;
  guess: RecallColour | null;
  distance: number | null;
  lightnessDifference: number | null;
  chromaDifference: number | null;
  hueDifference: number | null;
  score: number;
  label: string;
};

export type RecallRoundFeedback =
  | FrequencyRoundFeedback
  | ColourRoundFeedback;

export type RecallRoundState = {
  gameId: SecureRecallGameId;
  roundIndex: number;
  roundCount: 5;
  phase: "countdown" | "reveal" | "answer" | "waiting" | "feedback" | "complete";
  phaseEndsAt: string | null;
  target: number | RecallColour | null;
  ownAnswer: number | RecallColour | null;
  feedback: RecallRoundFeedback | null;
  ownSubmitted: boolean;
  opponentSubmitted: boolean;
  ownScore: number;
  opponentScore: number;
};

export const frequencyRoundSubmissionSchema = z.object({
  roundIndex: z.number().int().min(0).max(4),
  answer: z.number().finite().min(120).max(2000),
}).strict();

export const colourRoundSubmissionSchema = z.object({
  roundIndex: z.number().int().min(0).max(4),
  answer: z.object({
    l: z.number().finite().min(35).max(90),
    c: z.number().finite().min(4).max(32),
    h: z.number().finite().min(0).max(359),
  }).strict(),
}).strict();

const rounded = (value: number, precision = 3) => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const clampScore = (value: number) => Math.max(0, Math.min(10, value));

export function recallScoreLabel(score: number) {
  if (score >= 9.5) return "Nearly exact";
  if (score >= 8) return "Very close";
  if (score >= 6) return "Close";
  if (score >= 3) return "Off";
  return "Far off";
}

export function frequencyRoundFeedback(
  targetHz: number,
  guessHz: number | null,
): FrequencyRoundFeedback {
  if (guessHz === null) {
    return {
      kind: "frequency",
      targetHz,
      guessHz: null,
      differenceHz: null,
      percentError: null,
      centsError: null,
      direction: "none",
      score: 0,
      label: "No answer",
    };
  }
  const signedDifference = guessHz - targetHz;
  const cents = 1200 * Math.log2(guessHz / targetHz);
  const score = rounded(clampScore(10 * (1 - Math.abs(Math.log2(guessHz / targetHz)) / 1.5)));
  return {
    kind: "frequency",
    targetHz,
    guessHz,
    differenceHz: rounded(signedDifference),
    percentError: rounded((signedDifference / targetHz) * 100),
    centsError: rounded(cents),
    direction: signedDifference > 0 ? "high" : signedDifference < 0 ? "low" : "exact",
    score,
    label: recallScoreLabel(score),
  };
}

export function wrappedHueDifference(target: number, guess: number) {
  const raw = ((guess - target + 540) % 360) - 180;
  return raw === -180 ? 180 : raw;
}

export function colourRoundFeedback(
  target: RecallColour,
  guess: RecallColour | null,
): ColourRoundFeedback {
  if (guess === null) {
    return {
      kind: "colour",
      target,
      guess: null,
      distance: null,
      lightnessDifference: null,
      chromaDifference: null,
      hueDifference: null,
      score: 0,
      label: "No answer",
    };
  }
  const lightnessDifference = guess.l - target.l;
  const chromaDifference = guess.c - target.c;
  const hueDifference = wrappedHueDifference(target.h, guess.h);
  const distance = Math.sqrt(
    (lightnessDifference / 55) ** 2 +
    (chromaDifference / 28) ** 2 +
    (hueDifference / 180) ** 2,
  );
  const score = rounded(clampScore(10 * (1 - distance / 1.2)));
  return {
    kind: "colour",
    target,
    guess,
    distance: rounded(distance, 4),
    lightnessDifference: rounded(lightnessDifference),
    chromaDifference: rounded(chromaDifference),
    hueDifference: rounded(hueDifference),
    score,
    label: recallScoreLabel(score),
  };
}

export function isSecureRecallGame(
  gameId: string,
): gameId is SecureRecallGameId {
  return SECURE_RECALL_GAME_IDS.includes(gameId as SecureRecallGameId);
}

export function recallRoundTarget(
  gameId: SecureRecallGameId,
  challenge: Record<string, unknown>,
  roundIndex: number,
) {
  return gameId === "frequency_recall_v2"
    ? (challenge.frequencies as number[])[roundIndex]
    : (challenge.colors as RecallColour[])[roundIndex];
}

export function calculateRecallRoundFeedback(
  gameId: SecureRecallGameId,
  target: number | RecallColour,
  answer: number | RecallColour | null,
): RecallRoundFeedback {
  return gameId === "frequency_recall_v2"
    ? frequencyRoundFeedback(target as number, answer as number | null)
    : colourRoundFeedback(target as RecallColour, answer as RecallColour | null);
}
