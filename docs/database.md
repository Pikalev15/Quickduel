# Database schema

The versioned migrations in `supabase/migrations/` create:

- `profiles`: public player identity, rating, aggregate record, and accent.
- `game_stats`: per-player/per-game results and personal bests.
- `matchmaking_queue`: expiring rating, playlist, and game preference.
- `matches`: status, private challenge seed, game/version, timing, ranking flag,
  winner, and rematch link.
- `match_players`: readiness, private submission/result JSONB, trusted time, and
  rating change.

RLS is enabled on every public table. Clients cannot write queue, matches,
scores, results, ratings, or stats directly. Participant grants on `matches`
exclude `challenge_seed`; server-only result recording is granted only to
`service_role`. Public leaderboard RPCs expose deliberate profile fields only.

Core transactional functions:

- `join_matchmaking` / `heartbeat_matchmaking` / `leave_matchmaking`
- `get_match_snapshot` / `mark_match_ready`
- `submit_game_result` / `finalize_match_locked`
- `request_rematch`
- `ensure_profile` / `get_my_profile` / `update_profile`

Run `npx supabase db push --dry-run`, `npx supabase db push`, then
`npx supabase db lint --linked --level warning` for every schema change.
