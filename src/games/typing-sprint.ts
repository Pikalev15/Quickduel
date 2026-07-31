export const TYPING_SPRINT_DURATION_MS = 15_000;
export const TYPING_SPRINT_WORD_COUNT = 120;
export const TYPING_SPRINT_SUBMISSION_ALLOWANCE = 32;

export type TypingComparison = {
  correctChars: number;
  incorrectChars: number;
  completedWords: number;
  attemptedWords: number;
  typedChars: number;
  normalizedTyped: string;
};

export function normalizeTypingInput(typed: string) {
  return typed.replace(/ +/g, " ").replace(/^ +/, "");
}

/**
 * Compares word attempts independently so one insertion does not shift every
 * later character. Missing characters are errors only after a word is
 * completed; untouched future words and the untyped suffix of the active word
 * are not errors.
 */
export function compareTypingText(target: string, typed: string): TypingComparison {
  const targetWords = target.split(" ");
  const normalizedTyped = normalizeTypingInput(typed);
  const endsWithSpace = normalizedTyped.endsWith(" ");
  const trimmed = normalizedTyped.trim();
  const attempts = trimmed ? trimmed.split(" ") : [];
  let correctChars = 0;
  let incorrectChars = 0;

  attempts.forEach((attempt, wordIndex) => {
    const expected = targetWords[wordIndex] ?? "";
    const completed = wordIndex < attempts.length - 1 || endsWithSpace;
    const comparedLength = Math.min(attempt.length, expected.length);

    for (let index = 0; index < comparedLength; index += 1) {
      if (attempt[index] === expected[index]) correctChars += 1;
      else incorrectChars += 1;
    }

    if (attempt.length > expected.length) {
      incorrectChars += attempt.length - expected.length;
    } else if (completed && expected.length > attempt.length) {
      incorrectChars += expected.length - attempt.length;
    }
  });

  return {
    correctChars,
    incorrectChars,
    completedWords: attempts.filter(
      (attempt, index) =>
        index < attempts.length - 1 ||
        endsWithSpace ||
        attempt === targetWords[index],
    ).length,
    attemptedWords: attempts.length,
    typedChars: normalizedTyped.length,
    normalizedTyped,
  };
}

export function typingSprintStatistics(
  target: string,
  typed: string,
  durationMs = TYPING_SPRINT_DURATION_MS,
) {
  const comparison = compareTypingText(target, typed);
  const elapsedMinutes = Math.max(durationMs, 1) / 60_000;
  const grossWpm = comparison.typedChars / 5 / elapsedMinutes;
  const netWpm = Math.max(
    0,
    (comparison.correctChars - comparison.incorrectChars) / 5 / elapsedMinutes,
  );
  const accuracy =
    comparison.correctChars /
    Math.max(1, comparison.correctChars + comparison.incorrectChars);

  return {
    ...comparison,
    grossWpm,
    netWpm,
    accuracy,
  };
}
