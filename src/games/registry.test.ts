import { describe, expect, it } from "vitest";
import { GAME_IDS } from "./types";
import { gameRegistry, getGame } from "./registry";
import { gameCatalog } from "./catalog";

describe("game registry", () => {
  it("registers every game exactly once", () => {
    expect([...gameRegistry.keys()]).toEqual(GAME_IDS);
    expect(gameCatalog.map((game) => game.id)).toEqual(GAME_IDS);
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
});
