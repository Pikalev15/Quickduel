import type { GameCategory, GameId } from "./types";

export type GameCatalogEntry = {
  id: GameId;
  name: string;
  shortName: string;
  category: GameCategory;
  ranked: boolean;
  description: string;
};

export const gameCatalog: GameCatalogEntry[] = [
  { id: "memory_grid", name: "Memory Grid", shortName: "Grid", category: "mind", ranked: true, description: "Remember six highlighted tiles, then select them." },
  { id: "frequency_recall_v2", name: "Frequency Recall", shortName: "Frequency", category: "sensory", ranked: true, description: "Reconstruct five tones one at a time for a score out of 50." },
  { id: "colour_recall_v2", name: "Colour Recall", shortName: "Colour", category: "sensory", ranked: true, description: "Reconstruct five colours one at a time for a score out of 50." },
  { id: "time_recall", name: "Time Recall", shortName: "Time", category: "sensory", ranked: true, description: "Watch five pulses and estimate how long each lasts." },
  { id: "shape_recall", name: "Shape Recall", shortName: "Shape", category: "sensory", ranked: true, description: "Remember a six-point shape and rebuild it." },
  { id: "rhythm_recall", name: "Rhythm Recall", shortName: "Rhythm", category: "sensory", ranked: true, description: "Hear three short rhythms and tap their relative timing." },
  { id: "dot_estimate", name: "Dot Estimate", shortName: "Dots", category: "mind", ranked: true, description: "Estimate how many dots appeared." },
  { id: "number_order", name: "Number Order", shortName: "Order", category: "mind", ranked: true, description: "Tap ten numbers in ascending order." },
  { id: "odd_one_out", name: "Odd One Out", shortName: "Odd", category: "mind", ranked: true, description: "Find the rotated symbol." },
  { id: "pattern_complete", name: "Pattern Complete", shortName: "Pattern", category: "mind", ranked: true, description: "Complete six symbol patterns." },
  { id: "typing_sprint", name: "Typing Sprint", shortName: "Typing", category: "mind", ranked: true, description: "Type as many words as you can in 30 seconds." },
  { id: "reaction_test", name: "Reaction Test", shortName: "Reaction", category: "experimental", ranked: false, description: "Wait for green, then tap as quickly as you can." },
  { id: "target_tap", name: "Target Tap", shortName: "Targets", category: "experimental", ranked: false, description: "Tap 12 targets as quickly and accurately as possible." },
];

/** Preview games stay out of matchmaking and private-duel selection. */
export const practiceGameCatalog: GameCatalogEntry[] = [
  { id: "memory_grid_v2", name: "Memory Grid XL", shortName: "Grid", category: "mind", ranked: false, description: "Eight highlighted tiles on a 5×5 board." },
  { id: "cryptic_duel", name: "Cryptic Duel", shortName: "Cryptic", category: "mind", ranked: false, description: "Solve an original cryptic clue in 40 seconds." },
];
