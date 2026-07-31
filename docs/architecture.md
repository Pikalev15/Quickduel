# Architecture

## Main flow

The home screen signs a visitor in with Supabase anonymous Auth and calls
`ensure_profile`. `/play` joins the queue through a same-origin route handler.
That handler invokes a security-definer PostgreSQL function as the authenticated
user. Once a match ID is returned, both players enter `/match/[matchId]`, mark
ready, and receive the same phase-filtered public challenge.

The browser submits a game-specific JSON object. A trusted Next.js route
regenerates the challenge from the server-only seed, validates it with the
definition’s Zod schema, and calculates a normalized result. PostgreSQL measures
completion time from the official start and atomically finalizes the result,
per-game stats, and Elo when both answers exist.

The registry contains thirteen active IDs plus the immutable
`frequency_recall` and `colour_recall` v1 definitions. New matches select the v2
IDs, while historical rows keep resolving to the exact legacy definition. The
submission and challenge routes verify that the registry definition's numeric
version matches the persisted `game_version`.

## Matchmaking transaction

`join_matchmaking`:

1. Validates `auth.uid()` and ensures a profile.
2. Returns an existing active match for retry/idempotency.
3. Removes expired queue rows.
4. Upserts the caller's single queue row with playlist/game preference.
5. Selects one eligible opponent with `FOR UPDATE SKIP LOCKED`.
6. Chooses one compatible game and creates the match and both participant rows.
7. Deletes both queue rows in the same transaction.

The initial rating window is 150 and widens with wait time. PostgreSQL's row
lock prevents two callers from claiming the same waiting opponent.

The queue UI does not widen a selected playlist/game automatically. It shows
approximate health and offers an explicit broadening action. A local browser
lease prevents accidental duplicate queue tabs; PostgreSQL remains the
cross-device authority.

## Retention and social layer

Private-duel and friend/block/invitation changes are narrow transactional
database functions. Existing `matches` and `match_players` remain authoritative;
matches gain source, playlist, series, invalidation, and explicit-share metadata
instead of introducing a parallel scoring system.

The completion trigger updates progression, per-game rollups, weekly season
points, pair-farming counters, private-series score/next round, and an audit row
in the same database transaction. Elo remains owned by the existing idempotent
finalizer. History/statistics use participant-scoped RPC projections, while
public cards use a separate opt-in projection.

## Match lifecycle

`waiting → countdown → active → completed`

- Both ready calls are required before `starts_at` is assigned.
- `starts_at` is three seconds in the future and cannot be submitted by clients.
- The reveal and answer windows are derived from persisted durations.
- Ruleset-1 incomplete matches retain their historical abandonment behavior.
  Ruleset-2 expiry uses the locked timeout-forfeit finalizer described below.
- Duplicate answer writes are rejected by the `submitted_at is null` guard.
- Completion locks the match row and returns immediately if already completed.

## Realtime responsibilities

PostgreSQL remains authoritative. A private match channel provides Presence,
while a short phase-aware poll reloads the authoritative snapshot. Participant-
scoped policies on `realtime.messages` prevent access to other match topics.
There is no custom WebSocket server or high-frequency animation stream.

## Scoring and Elo finalization

Ranked human matches use K=32 and a 100–4000 clamp. Accuracy/result rank wins
first; server completion time breaks equal results, with a 10ms draw window. Both
profile updates, both `rating_after` values, statistics, winner, and completed
timestamp commit together.

Most QuickDuel games rank accuracy first and use speed only as a tiebreaker.
Typing Sprint is an explicit exception: net WPM is the primary result because
speed and accuracy are inseparable parts of typing performance. Its server
scoring always uses the fixed 15-second duration, then compares accuracy,
correct characters, fewer incorrect characters, and trusted receipt time only
when net WPM is equal.

## Bot isolation

Practice Bot is an explicit local route. Each definition supplies its own bot,
and practice uses the same deterministic engine and scoring functions but never
creates a database match, calls Elo, or touches
leaderboard statistics. It is only offered after eight seconds in the human
queue and is always labelled `Practice Bot · UNRANKED`.

## Trust boundaries and tradeoffs

- RLS and column grants exclude challenge seeds. Queue writes, readiness,
  submissions, rematches, scores, and ratings are RPC-only.
- The modern Supabase secret is server-only and required only for challenge
  regeneration/result recording.
- Browser anti-cheat cannot be perfect: a determined user can record displayed
  or audible stimuli or automate clicks. The server prevents fabricated
  outcomes, timestamps, cross-match writes, double rating, invalid arrays, and
  early/late submissions, but stronger challenge delivery and replay analysis
  would be needed for high-stakes competition.
- Serverless routes are thin authenticated adapters; Supabase owns transactions,
  durable state, and realtime.
- Incomplete matches are abandoned without rating. A future ruleset may add
  carefully defined started-match forfeits.

## Operations and future hardening

Routes attach correlation IDs and emit structured logs. An optional server-only
webhook receives sanitized errors. Database roles protect admin aggregates and
enforcement; audit rows record sensitive changes. Analytics is best effort and
isolated from match completion.

Future hardening includes scheduled analytics deletion, compensating Elo
corrections, replay validation, and better bot detection. The current HMAC
network throttling and threshold-triggered CAPTCHA deliberately avoid invasive
fingerprinting and unnecessary personal data.

## Ruleset 2 expiry lifecycle

`mark_match_ready` writes the official `starts_at` after both participant rows
have `ready_at`. That persisted schedule, not Realtime Presence, defines the
commitment and deadline. `ranked_forfeit_grace_seconds()` is the single source
for the five-second grace period.

Submissions and expiry share `finalize_match_outcome_locked`. It locks the match,
rechecks terminal state, calculates one outcome, updates ratings, records the
reason, and completes the match in one transaction. The batch finalizer uses
`FOR UPDATE SKIP LOCKED`; repeated calls are terminal no-ops. Existing rows keep
ruleset 1, so no historical abandonment is reinterpreted.

`match_chat_messages` is a short-retention participant projection. Authenticated
RPCs own sends/reports, Postgres Changes provides low-latency delivery, and a
three-second poll is the fallback. Chat has no authority over match state.
