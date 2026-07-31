import type { GameId } from "@/games/types";

export const GAME_STAT_LABELS: Record<GameId, string> = {
  memory_grid: "Average cells score",
  frequency_recall: "Average proportional pitch error",
  colour_recall: "Average perceptual colour error",
  time_recall: "Average proportional duration error",
  shape_recall: "Average radial error",
  rhythm_recall: "Average normalized timing error",
  dot_estimate: "Average absolute estimation error",
  number_order: "Average adjusted time",
  odd_one_out: "Correct-selection rate",
  pattern_complete: "Average correct answers",
  reaction_test: "Average response time",
  target_tap: "Average adjusted time",
};

export function formatAverageResult(gameId: GameId, averageRankScore: number) {
  switch (gameId) {
    case "memory_grid":
    case "pattern_complete":
      return averageRankScore.toFixed(2);
    case "frequency_recall":
      return `${(Math.abs(averageRankScore) * 100).toFixed(1)}%`;
    case "colour_recall":
    case "time_recall":
    case "shape_recall":
    case "rhythm_recall":
      return `${(Math.abs(averageRankScore) * 100).toFixed(1)}%`;
    case "dot_estimate":
      return `${Math.abs(averageRankScore).toFixed(1)} dots`;
    case "number_order":
    case "target_tap":
      return `${(Math.abs(averageRankScore) / 1_000).toFixed(2)}s`;
    case "odd_one_out":
      return `${Math.round(averageRankScore * 100)}%`;
    case "reaction_test":
      return `${Math.round(Math.abs(averageRankScore))}ms`;
  }
}
