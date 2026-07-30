export type MatchStatus =
  | "waiting"
  | "countdown"
  | "active"
  | "completed"
  | "abandoned"
  | "cancelled";

export type PublicProfile = {
  id: string;
  display_name: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches_played: number;
  rank: number;
  accent_colour: "volt" | "cyan" | "coral" | "violet" | "white";
  game_stats: Record<
    string,
    {
      played: number;
      wins: number;
      losses: number;
      draws: number;
      best_rank_score: number | null;
      best_time_ms: number | null;
    }
  >;
};

export type MatchPlayer = {
  user_id: string;
  display_name: string;
  ready_at: string | null;
  submitted_at: string | null;
  calculated_score: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  completion_time_ms: number | null;
  rating_before: number;
  rating_after: number | null;
  rating_delta: number | null;
  rematch_requested_at: string | null;
  result: {
    rankScore: number;
    accuracy: number;
    summary: string;
    details: Record<string, number | string | boolean>;
  } | null;
};

export type MatchSnapshot = {
  id: string;
  status: MatchStatus;
  game_type:
    | "memory_grid"
    | "frequency_recall"
    | "colour_recall"
    | "time_recall"
    | "shape_recall"
    | "rhythm_recall"
    | "dot_estimate"
    | "number_order"
    | "odd_one_out"
    | "pattern_complete"
    | "reaction_test"
    | "target_tap";
  game_version: 1;
  ranked: boolean;
  phase: "waiting" | "countdown" | "reveal" | "answer" | "result";
  challenge: Record<string, unknown>;
  reveal_duration_ms: number;
  answer_duration_ms: number;
  starts_at: string | null;
  expires_at: string;
  winner_id: string | null;
  completed_at: string | null;
  rematch_match_id: string | null;
  current_user_id: string;
  players: MatchPlayer[];
};
