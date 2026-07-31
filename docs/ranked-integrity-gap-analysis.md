# Ranked integrity gap analysis

Date: 2026-07-31

This audit was performed against `origin/main` at
`12c51358bc1daaa119d795743b13e18a44031596` before implementation work began.
The activation boundary for new timeout penalties must therefore be explicit;
existing expired matches must never receive a retroactive ranked loss.

## Confirmed gaps

### Ranked completion

- `get_match_snapshot` changes an expired `waiting`, `countdown`, or `active`
  match to `abandoned`. It does not distinguish a match that never started from
  one where both players committed and one player withheld a submission.
- `finalize_match_locked` returns until both submissions exist. There is no
  server-authoritative timeout path, no five-second grace period, and no
  browser-independent sweeper.
- `matches` has no completion reason or ruleset version. History and live match
  snapshots therefore cannot explain a timeout forfeit, double timeout,
  pre-start cancellation, or administrator invalidation.
- Rating writes are protected by the match row lock and terminal status check,
  but the same transaction boundary does not yet cover expiry adjudication.
- The completion trigger applies progression, game statistics, season points,
  and private-duel round advancement to every completed match. It needs explicit
  timeout semantics so missing submissions do not create invalid score
  aggregates and retries cannot advance a series twice.

### Abuse controls

- Existing rate limits are keyed only by account. Anonymous account rotation can
  evade queue, invite, reporting, and submission limits.
- No network identifier is derived from trusted hosting metadata, and there is
  no short-retention network-limit store.
- There is no adaptive CAPTCHA boundary for suspicious anonymous traffic.
- Anonymous users are eligible for public and weekly leaderboards immediately.
  There is no database-enforced provisional state based on linked identity,
  completed ranked human matches, and account restrictions.
- Existing farming signals cover repeated pairs, identical submissions, and
  implausible completion time, but do not deduplicate every signal at the
  database boundary.

### Stable failure contracts

- The match submission route detects duplicate submissions by parsing
  human-readable database error text.
- RPC failures are generally returned as prose conflicts rather than a stable
  domain-code mapping. Copy edits could therefore change control flow and abuse
  telemetry.

### Dependencies and operations

- Direct runtime dependencies use the `latest` range even though the lockfile
  contains exact resolutions.
- The package does not declare its supported Node.js engine.
- There is no scheduled expiry finalizer, deployment health signal for its last
  run, or rollout/runbook for activating timeout penalties safely.

### Test coverage

- Current tests concentrate on deterministic game logic and thin SQL policy
  checks. There are no route-boundary tests for domain errors, network abuse
  controls, provisional leaderboard eligibility, timeout races, or scheduled
  finalization.
- The documented production verification does not include the one-submission,
  double-timeout, pre-start-cancel, refresh-near-deadline, or private-ranked
  timeout paths.

## Scoped product addition: 1v1 match chat

The hardening brief says not to add social features, while the accompanying user
request explicitly asks for live chat in 1v1 matches. This implementation treats
that direct request as a narrow override only:

- chat is limited to the two participants of an existing match;
- there is no global chat, inbox, persistent direct messaging, or discovery;
- block relationships suppress sending and reading;
- writes are length-, rate-, and match-count-limited;
- messages have short retention and participant-only row-level access;
- users can mute locally and report individual messages;
- message delivery uses Realtime when available with an authenticated polling
  fallback, so chat does not affect match adjudication.

Chat is implemented only after the ranked-integrity boundaries above and must
not share authority with score submission or finalization.
