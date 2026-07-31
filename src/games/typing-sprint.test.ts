import { describe, expect, it } from "vitest";
import { getGame } from "./registry";
import { compareGameResults, type GameResult } from "./types";
import {
  compareTypingText,
  TYPING_SPRINT_DURATION_MS,
  TYPING_SPRINT_WORD_COUNT,
  typingSprintStatistics,
} from "./typing-sprint";
import { TYPING_SPRINT_WORDS } from "./word-lists";

describe("Typing Sprint generation", () => {
  const game = getGame("typing_sprint");

  it("generates a deterministic, original-sized word stream", () => {
    const first = game.generate("typing-seed");
    const second = game.generate("typing-seed");
    const different = game.generate("another-seed");
    const words = first.words as string[];

    expect(first).toEqual(second);
    expect(different.words).not.toEqual(words);
    expect(words).toHaveLength(TYPING_SPRINT_WORD_COUNT);
    expect(first.text).toBe(words.join(" "));
    expect(first.durationMs).toBe(TYPING_SPRINT_DURATION_MS);
    expect(words.every((word) => TYPING_SPRINT_WORDS.includes(word))).toBe(true);
    expect(words.some((word, index) => index > 0 && word === words[index - 1])).toBe(false);
  });

  it("keeps the curated vocabulary unique and within policy", () => {
    expect(TYPING_SPRINT_WORDS.length).toBeGreaterThanOrEqual(250);
    expect(TYPING_SPRINT_WORDS.length).toBeLessThanOrEqual(400);
    expect(new Set(TYPING_SPRINT_WORDS).size).toBe(TYPING_SPRINT_WORDS.length);
    expect(TYPING_SPRINT_WORDS.every((word) => /^[a-z]+$/.test(word))).toBe(true);
  });
});

describe("Typing Sprint word-aware comparison", () => {
  it("scores perfect input", () => {
    expect(compareTypingText("alpha bravo", "alpha bravo")).toMatchObject({
      correctChars: 10,
      incorrectChars: 0,
      completedWords: 2,
    });
  });

  it("counts substitutions without shifting later words", () => {
    expect(compareTypingText("alpha bravo", "alxha bravo")).toMatchObject({
      correctChars: 9,
      incorrectChars: 1,
    });
  });

  it("counts extra characters only in their word", () => {
    expect(compareTypingText("alpha bravo", "alphax bravo")).toMatchObject({
      correctChars: 10,
      incorrectChars: 1,
    });
  });

  it("counts missing characters after a completed word", () => {
    expect(compareTypingText("alpha bravo", "alp bravo")).toMatchObject({
      correctChars: 8,
      incorrectChars: 2,
    });
  });

  it("does not count an unfinished final suffix as errors", () => {
    expect(compareTypingText("alpha bravo future words", "alpha bra")).toMatchObject({
      correctChars: 8,
      incorrectChars: 0,
      completedWords: 1,
    });
  });

  it("penalizes a skipped word attempt without counting untouched future words", () => {
    const compared = compareTypingText("alpha bravo charlie", "alpha charlie");
    expect(compared.correctChars).toBe(6);
    expect(compared.incorrectChars).toBe(6);
    expect(compared.attemptedWords).toBe(2);
  });

  it("normalizes repeated spaces", () => {
    expect(compareTypingText("alpha bravo", "alpha   bravo")).toEqual(
      compareTypingText("alpha bravo", "alpha bravo"),
    );
  });

  it("handles empty and all-wrong input", () => {
    expect(compareTypingText("alpha bravo", "")).toMatchObject({
      correctChars: 0,
      incorrectChars: 0,
    });
    expect(compareTypingText("alpha bravo", "zzzzz zzzzz")).toMatchObject({
      correctChars: 0,
      incorrectChars: 10,
    });
  });
});

describe("Typing Sprint scoring and bot", () => {
  const game = getGame("typing_sprint");
  const challenge = game.generate("scoring-seed");
  const target = challenge.text as string;

  it("uses authoritative fixed duration and cannot be inflated by early submission", () => {
    const typed = target.slice(0, 60);
    const early = game.calculate(challenge, { typed }, 100);
    const deadline = game.calculate(challenge, { typed }, TYPING_SPRINT_DURATION_MS);
    expect(early).toEqual(deadline);
  });

  it("scores a perfect fixed-duration attempt through the game definition", () => {
    const typed = `${(challenge.words as string[]).slice(0, 8).join(" ")} `;
    const result = game.calculate(
      challenge,
      { typed },
      TYPING_SPRINT_DURATION_MS,
    );
    expect(result.rankScore).toBeGreaterThan(0);
    expect(result.accuracy).toBe(1);
    expect(result.details.incorrect).toBe(0);
    expect(result.details.completedWords).toBe(8);
  });

  it("uses elapsed time only for live display statistics", () => {
    const typed = target.slice(0, 30);
    expect(typingSprintStatistics(target, typed, 5_000).grossWpm).toBeGreaterThan(
      typingSprintStatistics(target, typed).grossWpm,
    );
  });

  it("keeps net WPM non-negative and accuracy bounded", () => {
    const allWrong = typingSprintStatistics(target, "zzzzz zzzzz zzzzz");
    expect(allWrong.netWpm).toBe(0);
    expect(allWrong.accuracy).toBeGreaterThanOrEqual(0);
    expect(allWrong.accuracy).toBeLessThanOrEqual(1);
  });

  it("rejects control characters and challenge-relative oversized payloads", () => {
    expect(game.submissionSchema.safeParse({ typed: "hello\nworld" }).success).toBe(false);
    expect(game.submissionSchema.safeParse({ typed: "hello\tworld" }).success).toBe(false);
    expect(game.submissionSchema.safeParse({ typed: "hello\u0000world" }).success).toBe(false);
    expect(game.validateSubmission?.(challenge, { typed: `${target}${"a".repeat(33)}` })).toBe(false);
  });

  it("creates a deterministic, valid, plausible bot through the human scoring path", () => {
    const first = game.bot("bot-seed", challenge);
    const second = game.bot("bot-seed", challenge);
    expect(first).toEqual(second);
    expect(game.submissionSchema.safeParse(first.submission).success).toBe(true);
    expect(String(first.submission.typed).length).toBeLessThanOrEqual(target.length);
    expect(String(first.submission.typed)).not.toBe(target);
    const score = game.calculate(challenge, first.submission, first.completionTimeMs);
    expect(score.rankScore).toBeGreaterThanOrEqual(20);
    expect(score.rankScore).toBeLessThanOrEqual(70);
    expect(score.details.incorrect).toBeGreaterThan(0);
  });

  it("breaks equal net-WPM results by accuracy, errors, then trusted timing", () => {
    const result = (
      accuracy: number,
      correct: number,
      incorrect: number,
    ): GameResult => ({
      rankScore: 52,
      accuracy,
      summary: "52 wpm",
      details: { correct, incorrect, netWpm: 52 },
    });

    expect(compareGameResults(result(0.98, 70, 1), 15_000, result(0.96, 70, 1), 14_900)).toBe("win");
    expect(compareGameResults(result(0.98, 70, 1), 15_000, result(0.98, 69, 1), 14_900)).toBe("win");
    expect(compareGameResults(result(0.98, 70, 1), 15_000, result(0.98, 70, 2), 14_900)).toBe("win");
    expect(compareGameResults(result(0.98, 70, 1), 14_900, result(0.98, 70, 1), 15_000)).toBe("win");
  });
});
