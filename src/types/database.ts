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
  public_code?: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  matches_played: number;
  rank: number;
  accent_colour: "volt" | "cyan" | "coral" | "violet" | "white";
  account_state?:
    | "normal"
    | "warning"
    | "ranked_restricted"
    | "temporarily_suspended"
    | "manually_banned"
    | "deleted";
  highest_rating?: number;
  current_win_streak?: number;
  best_win_streak?: number;
  onboarding_completed?: boolean;
  onboarding_skipped?: boolean;
  recommended_playlist?: "quick" | "sensory" | "mind" | null;
  equipped_cosmetics?: Record<string, string>;
  game_stats: Record<
    string,
    {
      played: number;
      wins: number;
      losses: number;
      draws: number;
      best_rank_score: number | null;
      best_time_ms: number | null;
      total_rank_score?: number;
      total_time_ms?: number;
      recent_results?: Array<{
        at: string;
        score: number;
        time_ms: number;
        outcome: "win" | "loss" | "draw";
      }>;
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
  ruleset_version?: number;
  completion_reason?:
    | "normal"
    | "timeout_forfeit"
    | "double_timeout"
    | "cancelled_before_start"
    | "admin_invalidated"
    | null;
  committed_at?: string | null;
  phase: "waiting" | "countdown" | "reveal" | "answer" | "result";
  challenge: Record<string, unknown>;
  reveal_duration_ms: number;
  answer_duration_ms: number;
  starts_at: string | null;
  expires_at: string;
  winner_id: string | null;
  completed_at: string | null;
  rematch_match_id: string | null;
  source?: "public_queue" | "private_duel";
  private_duel_code?: string | null;
  series_round?: number | null;
  current_user_id: string;
  players: MatchPlayer[];
};

export type PrivateDuelSnapshot = {
  code: string;
  state: "waiting" | "ready" | "active" | "completed" | "expired" | "cancelled";
  host_name: string;
  guest_name: string | null;
  selection_kind: "game" | "playlist";
  game_type: MatchSnapshot["game_type"] | null;
  playlist: "quick" | "sensory" | "mind" | "experimental";
  best_of: 1 | 3 | 5;
  ranked: boolean;
  host_score: number;
  guest_score: number;
  current_round: number;
  current_match_id: string | null;
  viewer_role: "host" | "guest" | "visitor";
  expires_at: string;
  completed_at: string | null;
  rounds: Array<{
    round: number;
    match_id: string | null;
    game_type: MatchSnapshot["game_type"];
    status: MatchStatus;
    winner: "host" | "guest" | "draw";
  }>;
};

export type MatchHistoryItem = {
  id: string;
  outcome: "win" | "loss" | "draw";
  opponent_name: string;
  opponent_code: string;
  game_type: MatchSnapshot["game_type"];
  ranked: boolean;
  rating_delta: number | null;
  player_summary: string;
  opponent_summary: string;
  player_time_ms: number;
  opponent_time_ms: number;
  completed_at: string;
  completion_reason:
    | "normal"
    | "timeout_forfeit"
    | "double_timeout"
    | "cancelled_before_start"
    | "admin_invalidated"
    | null;
  source: "public_queue" | "private_duel";
  private_duel_id: string | null;
  series_round: number | null;
};
