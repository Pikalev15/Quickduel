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
  { id: "memory_grid", name: "Memory Grid", shortName: "Grid", category: "mind", ranked: true, description: "Memorize six charged cells, then recall them before the clock closes." },
  { id: "frequency_recall_v2", name: "Frequency Recall", shortName: "Frequency", category: "sensory", ranked: true, description: "Reconstruct five tones one at a time for a score out of 50." },
  { id: "colour_recall_v2", name: "Colour Recall", shortName: "Colour", category: "sensory", ranked: true, description: "Reconstruct five colours one at a time for a score out of 50." },
  { id: "time_recall", name: "Time Recall", shortName: "Time", category: "sensory", ranked: true, description: "Internalize five visual pulse durations and reproduce their timing." },
  { id: "shape_recall", name: "Shape Recall", shortName: "Shape", category: "sensory", ranked: true, description: "Rebuild a six-point radial silhouette from memory." },
  { id: "rhythm_recall", name: "Rhythm Recall", shortName: "Rhythm", category: "sensory", ranked: true, description: "Hear three short rhythms and tap their relative timing." },
  { id: "dot_estimate", name: "Dot Estimate", shortName: "Dots", category: "mind", ranked: true, description: "Estimate a dense field without counting every dot." },
  { id: "number_order", name: "Number Order", shortName: "Order", category: "mind", ranked: true, description: "Clear ten scattered numbers from lowest to highest." },
  { id: "odd_one_out", name: "Odd One Out", shortName: "Odd", category: "mind", ranked: true, description: "Spot the single rotated symbol in a packed field." },
  { id: "pattern_complete", name: "Pattern Complete", shortName: "Pattern", category: "mind", ranked: true, description: "Resolve six compact symbol sequences under pressure." },
  { id: "typing_sprint", name: "Typing Sprint", shortName: "Typing", category: "mind", ranked: true, description: "Type a deterministic word stream for fifteen seconds." },
  { id: "reaction_test", name: "Reaction Test", shortName: "Reaction", category: "experimental", ranked: false, description: "Five randomized go-signals test raw response latency." },
  { id: "target_tap", name: "Target Tap", shortName: "Targets", category: "experimental", ranked: false, description: "Strike twelve deterministic targets with minimal misses." },
];
