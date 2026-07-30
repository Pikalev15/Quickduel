import type { GameCategory, GameId } from "./types";

export type GameCatalogEntry = {
  id: GameId;
  name: string;
  category: GameCategory;
  ranked: boolean;
  description: string;
};

export const gameCatalog: GameCatalogEntry[] = [
  { id: "memory_grid", name: "Memory Grid", category: "mind", ranked: true, description: "Memorize six charged cells, then recall them before the clock closes." },
  { id: "frequency_recall", name: "Frequency Recall", category: "sensory", ranked: true, description: "Hear three clean tones and rebuild their pitch contour." },
  { id: "colour_recall", name: "Colour Recall", category: "sensory", ranked: true, description: "Reconstruct three briefly shown colours in perceptual OKLCH space." },
  { id: "time_recall", name: "Time Recall", category: "sensory", ranked: true, description: "Internalize five visual pulse durations and reproduce their timing." },
  { id: "shape_recall", name: "Shape Recall", category: "sensory", ranked: true, description: "Rebuild a six-point radial silhouette from memory." },
  { id: "rhythm_recall", name: "Rhythm Recall", category: "sensory", ranked: true, description: "Hear three short rhythms and tap their relative timing." },
  { id: "dot_estimate", name: "Dot Estimate", category: "mind", ranked: true, description: "Estimate a dense field without counting every dot." },
  { id: "number_order", name: "Number Order", category: "mind", ranked: true, description: "Clear ten scattered numbers from lowest to highest." },
  { id: "odd_one_out", name: "Odd One Out", category: "mind", ranked: true, description: "Spot the single rotated symbol in a packed field." },
  { id: "pattern_complete", name: "Pattern Complete", category: "mind", ranked: true, description: "Resolve six compact symbol sequences under pressure." },
  { id: "reaction_test", name: "Reaction Test", category: "experimental", ranked: false, description: "Five randomized go-signals test raw response latency." },
  { id: "target_tap", name: "Target Tap", category: "experimental", ranked: false, description: "Strike twelve deterministic targets with minimal misses." },
];
