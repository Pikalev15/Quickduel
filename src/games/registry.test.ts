import { describe, expect, it } from "vitest";
import { ACTIVE_GAME_IDS, GAME_IDS } from "./types";
import { gameRegistry, getGame } from "./registry";
import { gameCatalog } from "./catalog";

describe("game registry", () => {
  it("registers every game exactly once", () => {
    expect([...gameRegistry.keys()]).toEqual(GAME_IDS);
    expect(gameCatalog.map((game) => game.id)).toEqual(ACTIVE_GAME_IDS);
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

  it("uses an eight-second Memory Grid answer window", () => {
    expect(getGame("memory_grid").answerDurationMs).toBe(8000);
  });

  it("stops Number Order as soon as all targets are selected", () => {
    const game = getGame("number_order");
    expect(game.answerDurationMs).toBe(8000);
    expect(game.autoSubmitOnValid).toBe(true);
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
