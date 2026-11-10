# QuickDuel games handoff

## Changes

- Preserve entered game state after locking an answer while waiting for the opponent.
- Added answer-window progress indicators in Practice and ranked matches, focus
  and pressed feedback for game controls, and reduced-motion handling.
- Made audio resume awaitable and added an in-round replay control for ranked
  Frequency Recall when browser autoplay is blocked.
- Fixed Rhythm Recall input exceeding the strict generated beat count/schema.
  Answer-phase snapshots expose only per-round tap counts, and the reveal
  window covers the longest seeded three-rhythm playback.
- Replaced Time Recall's clipped, capped sequential pulses with duration-scaled
  parallel pulses inside the reveal window; its timing-error summary now shows
  a percent unit.
- Added valid visible initial answers for Dot Estimate, Time Recall, and Shape
  Recall. Shape Recall vertices show the matching slider numbers.
- Varied Pattern Complete's six seeded puzzles across six sequence rules and
  added generated-answer/scoring regression coverage.
- Replaced generic result counts with game-specific metrics where meaningful,
  including Number Order completion/errors. Typing Sprint character counts
  remain as before; fixed Target Tap's irregular “misses” plural.
- Prevented overlapping match/round polls from applying stale snapshots and
  replaced the old nested Time Recall timeout chain.

## Evidence and checks

- Coordinator personally completed all 13 active practice games and navigated
  the public site, unavailable-backend states, invalid links, and mobile layouts.
  See `docs/playtest-2026-11-08.md` for direct experience and limitations.
- Unit tests: 100 passed across 15 files. Lint, typecheck, and production build passed.
- Final desktop/mobile product suite: 42 passed (2 minutes), with four live
  Supabase cases skipped. This uses the merged dependency versions.
- Rhythm has a desktop/mobile completion and rematch regression. Pattern's v1
  seeded answer/option stream is preserved, with a historical seed fixture.
- PR #10 merged at 31d022c; PR #9 merged at 8005398, both with successful GitHub
  CI and Vercel checks. Next 16.4.5 / Zod 4.6.7 address available production
  advisories. Production audit: zero. Eight moderate dev-tool advisories remain.
- Gameplay release published at 9eb1d01; dependency PRs #9 and #10 are merged.

## Deployment and limits

Production: https://quickduel-nu.vercel.app. Both the Rhythm reveal migration
and ranked completion trigger fix are applied to hosted Supabase. Production
browser sessions exercised anonymous authentication, matchmaking, both answer
submissions, results, rating changes, and rematch. Perceived audio quality and
human difficulty balancing remain unverified. No separate review was run, as
requested. Adaptive Turnstile site/secret keys still require configuration.

## 2026-11-11 release continuation

- Added Rhythm retry controls; incomplete recordings keep other rhythm tabs
  disabled to avoid corrupting timing on a mid-recording switch. Clicking the
  active tab preserves its recording clock. Odd One Out tiles now expose
  numbered labels and selected state to assistive technology.
- Applied the Rhythm reveal migration to QuickDuel's connected Supabase project
  (`zzliadfnhgiaphkxkcfm`). Verified 13000ms and no anon/authenticated EXECUTE.
- Live browser found analytics returning 403 because RATE_LIMIT_HASH_KEY was
  absent. Added a generated sensitive server-only Vercel production/preview key.
  Turnstile keys are still absent; high-risk adaptive challenges need owner setup.
- Release validation: 100 unit tests, lint and production build passed.
  Desktop/mobile E2E: 41 passed initially; a test-only bot-result timing race
  was corrected and both affected desktop/mobile cases passed on rerun (42
  unique product cases passed overall; four disposable-backend cases skipped).
- Supabase pgTap is unavailable on the hosted project; verified the changed
  function and privileges directly without installing extensions.
- Live two-user play uncovered a ranked completion 500: the season trigger's
  `season_id` variable conflicted with upsert column names. Renamed the variable
  in a forward migration. The stuck match recovered via normal timeout; a new
  rematch completed with both submissions and opposite rating deltas (+15/-15).
- Ran `supabase/tests/ranked_completion_regression.sql` on hosted Supabase in a
  rollback transaction: normal completion, both season upserts, daily pair cap,
  and retry idempotency passed without pgTap or persistent test fixtures.

Live history correctly lists the normal result and timeout forfeit. Season play
also exposed a misleading #1 rank for provisional players omitted from the public
board. The screen now labels that status Provisional, explains that points are
saved, and gives an accurate empty-board message. Desktop/mobile browser coverage
checks that state; lint, typecheck and production build pass for this follow-up.
