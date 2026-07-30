"use client";

import {
  ColourRecallGame,
  DotEstimateGame,
  FrequencyRecallGame,
  MemoryGridGame,
  NumberOrderGame,
  OddOneOutGame,
  PatternCompleteGame,
  ReactionTestGame,
  RhythmRecallGame,
  ShapeRecallGame,
  TargetTapGame,
  TimeRecallGame,
} from "./game-components";
import type { GameComponentProps, GameId } from "./types";

export function GameRenderer({
  gameId,
  ...props
}: GameComponentProps & { gameId: GameId }) {
  switch (gameId) {
    case "memory_grid":
      return <MemoryGridGame {...props} />;
    case "frequency_recall":
      return <FrequencyRecallGame {...props} />;
    case "colour_recall":
      return <ColourRecallGame {...props} />;
    case "time_recall":
      return <TimeRecallGame {...props} />;
    case "shape_recall":
      return <ShapeRecallGame {...props} />;
    case "rhythm_recall":
      return <RhythmRecallGame {...props} />;
    case "dot_estimate":
      return <DotEstimateGame {...props} />;
    case "number_order":
      return <NumberOrderGame {...props} />;
    case "odd_one_out":
      return <OddOneOutGame {...props} />;
    case "pattern_complete":
      return <PatternCompleteGame {...props} />;
    case "reaction_test":
      return <ReactionTestGame {...props} />;
    case "target_tap":
      return <TargetTapGame {...props} />;
  }
}
