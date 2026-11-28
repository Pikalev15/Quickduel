import { describe, expect, it } from "vitest";
import { ACTIVE_GAME_IDS, GAME_IDS } from "./types";
import { gameRegistry, getGame } from "./registry";
import { gameCatalog } from "./catalog";
import { getGameDisplay } from "./display";
import {
  RHYTHM_COUNT,
  RHYTHM_MAX_INTERVAL_MS,
  RHYTHM_MAX_TAPS,
  RHYTHM_REVEAL_DURATION_MS,
  RHYTHM_SEQUENCE_GAP_MS,
} from "./rhythm-input";
import {
  MEMORY_GRID_FLASH_MS,
  MEMORY_GRID_RETENTION_MS,
  MEMORY_GRID_REVEAL_DURATION_MS,
} from "./memory-grid-timing";

describe("game registry", () => {
  it("registers every game exactly once", () => {
    expect([...gameRegistry.keys()]).toEqual(GAME_IDS);
    expect(gameCatalog.map((game) => game.id)).toEqual(ACTIVE_GAME_IDS);
  });

  it("keeps lightweight display metadata aligned with the game catalog", () => {
    for (const game of gameCatalog) {
      expect(getGameDisplay(game.id)).toMatchObject({
        name: game.name,
        shortName: game.shortName,
        category: game.category,
      });
    }
    expect(getGameDisplay("frequency_recall").shortName).toBe("Frequency");
    expect(getGameDisplay("colour_recall").shortName).toBe("Colour");
  });

  it.each(GAME_IDS)("%s is deterministic and its bot submission is valid", (gameId) => {
    const game = getGame(gameId);
    const first = game.generate("deterministic-seed");
    const second = game.generate("deterministic-seed");
    expect(first).toEqual(second);

    const bot = game.bot("deterministic-seed", first);
    expect(game.submissionSchema.safeParse(bot.submission).success).toBe(true);
    expect(game.calculate(first, bot.submission, bot.completionTimeMs).rankScore).toBeTypeOf("number");
  });

  it("keeps Memory Grid accuracy ahead of speed", () => {
    const game = getGame("memory_grid");
    const challenge = game.generate("fairness");
    const correct = game.calculate(challenge, { selectedCells: challenge.highlightedCells }, 7900);
    const fastGuess = game.calculate(challenge, { selectedCells: [0] }, 100);
    expect(correct.rankScore).toBeGreaterThan(fastGuess.rankScore);
  });

  it("uses a full 2.5-second Memory Grid reveal and seven-second answer", () => {
    const game = getGame("memory_grid");
    expect(MEMORY_GRID_FLASH_MS).toBe(2500);
    expect(MEMORY_GRID_RETENTION_MS).toBe(0);
    expect(MEMORY_GRID_REVEAL_DURATION_MS).toBe(2500);
    expect(game.revealDurationMs).toBe(MEMORY_GRID_REVEAL_DURATION_MS);
    expect(game.answerDurationMs).toBe(7000);
  });

  it("stops Number Order as soon as all targets are selected", () => {
    const game = getGame("number_order");
    expect(game.answerDurationMs).toBe(8000);
    expect(game.autoSubmitOnValid).toBe(true);
  });

  it("varies Pattern Complete rules and scores their generated answers", () => {
    const game = getGame("pattern_complete");
    const challenge = game.generate("varied-pattern-rules");
    const puzzles = challenge.puzzles as Array<{
      sequence: string[];
      options: string[];
      answer: string;
    }>;

    expect(puzzles).toHaveLength(6);
    // Historical v1 seed: presentation changes must preserve submitted answer indices.
    expect(puzzles.map(({ answer, options }) => ({ answer, options }))).toEqual([
      { answer: "●", options: ["●", "▲", "■", "◆"] },
      { answer: "●", options: ["●", "■", "◆", "▲"] },
      { answer: "▲", options: ["■", "◆", "●", "▲"] },
      { answer: "▲", options: ["●", "■", "◆", "▲"] },
      { answer: "▲", options: ["●", "▲", "◆", "■"] },
      { answer: "◆", options: ["■", "▲", "◆", "●"] },
    ]);
    expect(new Set(puzzles.map((puzzle) => puzzle.sequence.join(""))).size).toBe(6);
    expect(puzzles.some((puzzle) => puzzle.answer !== puzzle.sequence[0])).toBe(true);

    const correct = puzzles.map((puzzle) => puzzle.options.indexOf(puzzle.answer));
    const perfect = game.calculate(challenge, { answers: correct }, 18000);
    const incorrect = game.calculate(
      challenge,
      { answers: correct.map((answer) => (answer + 1) % 4) },
      18000,
    );
    expect(perfect.rankScore).toBe(6);
    expect(perfect.accuracy).toBe(1);
    expect(incorrect.rankScore).toBe(0);
    expect(incorrect.accuracy).toBe(0);
  });

  it("keeps Rhythm Recall's sequence private while publishing safe tap counts", () => {
    const game = getGame("rhythm_recall");
    const challenge = game.generate("rhythm-safe-counts");
    const rhythms = challenge.rhythms as number[][];
    const answerChallenge = game.publicChallenge(challenge, "answer");

    expect(game.revealDurationMs).toBe(RHYTHM_REVEAL_DURATION_MS);
    expect(RHYTHM_REVEAL_DURATION_MS).toBeGreaterThanOrEqual(
      30 + RHYTHM_COUNT * (RHYTHM_MAX_TAPS - 1) * RHYTHM_MAX_INTERVAL_MS +
        (RHYTHM_COUNT - 1) * RHYTHM_SEQUENCE_GAP_MS + 80,
    );
    expect(answerChallenge).toEqual({ tapCounts: rhythms.map((rhythm) => rhythm.length) });
    expect(answerChallenge).not.toHaveProperty("rhythms");
    expect(game.publicChallenge(challenge, "reveal")).toEqual(challenge);
  });

  it("labels Time Recall's result error as a percentage", () => {
    const game = getGame("time_recall");
    const challenge = { durations: [1000, 1000, 1000, 1000, 1000] };
    expect(
      game.calculate(challenge, { durationsMs: challenge.durations }, game.answerDurationMs).summary,
    ).toBe("0% timing error");
  });

  it("keeps recall v1 immutable and resolves v2 as separate entries", () => {
    const frequencyV1 = getGame("frequency_recall");
    const frequencyV2 = getGame("frequency_recall_v2");
    const colourV1 = getGame("colour_recall");
    const colourV2 = getGame("colour_recall_v2");

    expect(frequencyV1.version).toBe(1);
    expect((frequencyV1.generate("legacy").frequencies as number[])).toHaveLength(3);
    expect(frequencyV1.submissionSchema.safeParse({ guessesHz: [440, 660, 880] }).success).toBe(true);
    expect(colourV1.version).toBe(1);
    expect((colourV1.generate("legacy").colors as unknown[])).toHaveLength(3);

    expect(frequencyV2.version).toBe(2);
    expect((frequencyV2.generate("current").frequencies as number[])).toHaveLength(5);
    expect(colourV2.version).toBe(2);
    expect((colourV2.generate("current").colors as unknown[])).toHaveLength(5);
  });

  it("keeps partial secure-recall credit and averages only answered rounds", () => {
    const frequency = getGame("frequency_recall_v2");
    const frequencyChallenge = frequency.generate("partial-frequency");
    const frequencyResult = frequency.calculate(
      frequencyChallenge,
      { guessesHz: [(frequencyChallenge.frequencies as number[])[0], null, null, null, null] },
      frequency.answerDurationMs,
    );
    expect(frequencyResult.rankScore).toBe(10);
    expect(frequencyResult.details.round1Answered).toBe(true);
    expect(frequencyResult.details.round2Answered).toBe(false);
    expect(frequencyResult.details.averageError).toBe(0);

    const colour = getGame("colour_recall_v2");
    const colourChallenge = colour.generate("partial-colour");
    const colourResult = colour.calculate(
      colourChallenge,
      { colors: [(colourChallenge.colors as Array<{ l: number; c: number; h: number }>)[0], null, null, null, null] },
      colour.answerDurationMs,
    );
    expect(colourResult.rankScore).toBe(10);
    expect(colourResult.details.round1Answered).toBe(true);
    expect(colourResult.details.round2Answered).toBe(false);
    expect(colourResult.details.averageDistance).toBe(0);
  });

  it.each(["frequency_recall_v2", "colour_recall_v2"] as const)(
    "%s scores a perfect five-round run as 50",
    (gameId) => {
      const game = getGame(gameId);
      const challenge = game.generate("perfect-rounds");
      const submission = gameId === "frequency_recall_v2"
        ? { guessesHz: challenge.frequencies }
        : { colors: challenge.colors };
      const calculated = game.calculate(challenge, submission, game.answerDurationMs);
      expect(calculated.rankScore).toBe(50);
      expect(calculated.summary).toBe("50/50");
      expect(calculated.accuracy).toBe(1);
    },
  );
});


describe("active challenge projections", () => {
  it("keeps Odd One Out's private answer index off the public board", () => {
    const game = getGame("odd_one_out");
    const challenge = game.generate("odd-public-projection");
    const projected = game.publicChallenge(challenge, "answer");
    expect(projected).not.toHaveProperty("oddIndex");
    expect(projected).not.toHaveProperty("showAnswer");
    const tiles = projected.tiles as Array<{ glyph: string; rotation: number }>;
    expect(tiles).toHaveLength(16);
    expect(tiles.filter((tile) => tile.rotation !== 0)).toHaveLength(1);
    expect(tiles.findIndex((tile) => tile.rotation !== 0)).toBe(challenge.oddIndex);
    expect(game.publicChallenge(projected, "answer")).toEqual(projected);
    expect(game.calculate(challenge, { selectedIndex: challenge.oddIndex }, 1000).accuracy).toBe(1);
  });
});

describe("practice previews", () => {
  it("keeps legacy Memory Grid unchanged while XL has eight unique targets", () => {
    const original = getGame("memory_grid").generate("xl-test");
    const game = getGame("memory_grid_v2");
    const challenge = game.generate("xl-test");
    expect(original.size).toBe(4);
    expect(original.highlightedCells).toHaveLength(6);
    expect(challenge.size).toBe(5);
    expect(new Set(challenge.highlightedCells as number[]).size).toBe(8);
    expect(game.calculate(challenge, { selectedCells: challenge.highlightedCells }, 5000).summary).toBe("8/8 cells");
    expect(game.submissionSchema.safeParse({ selectedCells: [25] }).success).toBe(false);
    expect(game.submissionSchema.safeParse({ selectedCells: [1, 1] }).success).toBe(false);
    expect(game.publicChallenge(challenge, "answer")).not.toHaveProperty("highlightedCells");
    expect(ACTIVE_GAME_IDS).not.toContain(game.id);
  });
  it("scores cryptic clues and hides explicit answer fields during play", () => {
    const game = getGame("cryptic_duel");
    const challenge = game.generate("cryptic-test");
    expect(game.publicChallenge(challenge, "answer")).not.toHaveProperty("answer");
    expect(game.publicChallenge(challenge, "answer")).not.toHaveProperty("explanation");
    expect(game.calculate(challenge, { answer: String(challenge.answer).toLowerCase(), hintsUsed: 0 }, 1000).rankScore).toBe(10);
    expect(game.calculate(challenge, { answer: challenge.answer, hintsUsed: 2 }, 1000).rankScore).toBe(6);
    expect(game.calculate(challenge, { answer: "ZZZZ", hintsUsed: 0 }, 1000).rankScore).toBe(0);
    expect(ACTIVE_GAME_IDS).not.toContain(game.id);
  });
});
