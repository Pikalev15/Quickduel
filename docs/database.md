# Database schema

The versioned migrations in `supabase/migrations/` create:

- `profiles`: public player identity, rating, aggregate record, and accent.
- `game_stats`: per-player/per-game results and personal bests.
- `matchmaking_queue`: expiring rating, playlist, and game preference.
- `matches`: status, private challenge seed, game/version, timing, ranking flag,
  winner, and rematch link.
- `match_players`: readiness, private submission/result JSONB, trusted time, and
  rating change.
- `private_duels`: link, participants, selection, format, state, and series.
- `user_progression`: highest rating, streaks, and onboarding state.
- `season_definitions`, `season_player_stats`, `season_pair_daily_counts`:
  weekly UTC leaderboards and anti-farming counters.
- `friend_requests`, `friends`, `user_blocks`, `duel_invitations`: social graph.
- `analytics_events`: privacy-bounded first-party events.
- `rate_limit_buckets`, `abuse_flags`, `account_enforcement`, `admin_roles`,
  `audit_log`: safety and operations.
- `cosmetics`, `user_cosmetics`, `equipped_cosmetics`: catalogue and ownership.

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
- private-duel create/get/join/leave
- history/detail, personal stats, and season overview
- search/friend/block/invitation mutations
- match share, cosmetic, account-deletion, analytics, and admin functions

Run `npx supabase db push --dry-run`, `npx supabase db push`, then
`npx supabase db lint --linked --level warning` for every schema change.
The new migration is
`supabase/migrations/202607310001_retention_social_progression.sql`; its pgTAP
contract is `supabase/tests/retention_verification.sql`.

## Ranked integrity migration

`202607310002_ranked_integrity_and_match_chat.sql` adds:

- `matches.ruleset_version`, `committed_at`, and `completion_reason`;
- locked normal/expiry finalizers and an `integrity_runtime` sweep heartbeat;
- stable submission error details;
- HMAC-only network buckets with short retention;
- database-enforced public and season eligibility;
- participant-only match chat, reports, RLS, Realtime publication, and cleanup;
- an open-abuse-flag deduplication index and new farming review signals.

Existing rows receive ruleset 1. Only newly created matches default to ruleset 2.
The migration installs a minute Supabase `pg_cron` job named
`quickduel-ranked-integrity-sweep`. It calls
`run_ranked_integrity_maintenance()`, which runs
`finalize_expired_matches(200)` and `cleanup_integrity_data()` in the database.
Cleanup also prunes Supabase Cron run history after seven days.
The authenticated HTTP cron route remains available only as an emergency
manual trigger.

## Game versions and Typing Sprint

`20260731043411_add_game_versions_and_typing_sprint.sql` adds the
`frequency_recall_v2`, `colour_recall_v2`, and `typing_sprint` game types. It
replaces the version-1-only check with an explicit game/version-pair constraint:
the two v2 recall IDs require version 2 and all other supported IDs require
version 1. The migration updates public and private matchmaking pools, persisted
durations, and match inserts while preserving explicit function revokes and
narrow authenticated grants.

`20260731052027_memory_grid_retention_interval.sql` changes only the duration
helper used when creating new matches. Memory Grid now persists a 2.95-second
reveal phase: 1.2 seconds visible followed by a 1.75-second locked retention
interval. The function remains security-definer with an empty search path and
no browser-role execute grant.
