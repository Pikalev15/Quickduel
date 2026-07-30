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

## Match lifecycle

`waiting → countdown → active → completed`

- Both ready calls are required before `starts_at` is assigned.
- `starts_at` is three seconds in the future and cannot be submitted by clients.
- The reveal and answer windows are derived from persisted durations.
- Expired incomplete matches become `abandoned` with no automatic rating award.
- Duplicate answer writes are rejected by the `submitted_at is null` guard.
- Completion locks the match row and returns immediately if already completed.

## Realtime responsibilities

PostgreSQL remains authoritative. A private match channel provides Presence,
while a short phase-aware poll reloads the authoritative snapshot. Participant-
scoped policies on `realtime.messages` prevent access to other match topics.
There is no custom WebSocket server or high-frequency animation stream.

## Elo finalization

Ranked human matches use K=32 and a 100–4000 clamp. Accuracy/result rank wins
first; server completion time breaks equal results, with a 10ms draw window. Both
profile updates, both `rating_after` values, statistics, winner, and completed
timestamp commit together.

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

## Future hardening

Add CAPTCHA at abuse thresholds, stronger per-user/IP rate limits, abuse
monitoring, audit logs, match replay validation, better bot
detection, and more advanced cheat detection. Do not add invasive
fingerprinting or unnecessary personal data.
