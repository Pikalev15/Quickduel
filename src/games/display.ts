import { gameCatalog, type GameCatalogEntry } from "./catalog";
import type { GameId } from "./types";

type GameDisplay = Pick<GameCatalogEntry, "name" | "shortName" | "category">;

const legacyGames: Record<"frequency_recall" | "colour_recall", GameDisplay> = {
  frequency_recall: { name: "Frequency Recall", shortName: "Frequency", category: "sensory" },
  colour_recall: { name: "Colour Recall", shortName: "Colour", category: "sensory" },
};

const gameDisplay = new Map<GameId, GameDisplay>([
  ...gameCatalog.map((game) => [game.id, game] as const),
  ...Object.entries(legacyGames) as Array<[GameId, GameDisplay]>,
]);

export function getGameDisplay(gameId: GameId): GameDisplay {
  const game = gameDisplay.get(gameId);
  if (!game) throw new Error(`Unknown game: ${gameId}`);
  return game;
}
