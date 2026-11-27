# Workshop and progression candidate

Draft only. Do not merge, deploy or run live SQL without isolated validation. Apply pending frequency timing and daily migrations to a disposable database first, then workshop_adaptive.sql, then skill_progress_daily_rotation.sql. Verify constraints, RLS, grants, atomic host creation, locked configuration, match-start trigger, ranked completion, and old matches. Use two real clients with delayed snapshots and a physical iPhone. No production changes.

## Candidate features

- Shared lower placed rating bracket (standard if either player is in placements); practice rank recommendation with manual override.
- Ten Workshop-compatible games; custom timers, memory grid geometry and ordered recall, dot density and shape variation. Rhythm preserves its full 13-second reveal and permits 10–60 seconds of answering.
- Secure Frequency and Colour workshops retain five rounds, reveal/listen gates, two-second feedback, scoring, and legacy match budgets (60s/40s). Only the answer window changes: Frequency 3–6 seconds per round; Colour 3–5.2 seconds per round. SQL scheduling and the early listen acknowledgement path both use persisted unranked rules. Default ranked behavior is unchanged.
- Device-local presets and portable QD1 codes include game, best-of format and validated rules; no room code, account, seed or ranked flag. Import is explicit and does not create a room.
- Daily rotation v3 includes pattern, number sequence, odd-one-out, colour matching and dot estimation. Historical v1 and v2 remain stable. New visual puzzles are perception tasks, not secure timed memory challenges.
- Same-timing ranked records and recent accuracy mastery, device-local practice records, weekly daily points tournament, game-level rivalries, result-record animation and supported haptics.
- Precision, Versatility and Champion frames awarded by authoritative valid ranked public results. No client-submitted mastery or cosmetic score.
- Rhythm rejects incorrect tap counts, duplicate/backward timestamps and non-finite input.

## Release gates

1. Run npm ci, check:copy, lint, typecheck, tests, production build and browser suites on the exact candidate head.
2. Isolated DB: verify schema constraints permit all timings, all SQL applies once in order, and rollback/backup strategy. Test authenticated host versus other users; reject ranked workshops, incompatible fields and direct client grants.
3. Two clients: verify same persisted rules, late snapshots, timeouts, refresh/reconnect, all best-of rounds, full rhythm playback, invalid tap rejection, and no Elo changes for Workshop games.
4. Secure recall: test two acknowledged listeners, one or zero acknowledgements, no premature answer window, early reveal shortening with the custom duration, colour/frequency timeout, feedback, finalization versus expiry sweep and preservation of standard ranked timing. Never expose a future round target. Verify polling delays against the existing total budgets.
5. Daily: check v1/v2 historical determinism, v3 all five formats, single attempt, deadlines and server scoring, midnight rotation, weekly leaderboard, mobile visual layout and colour selection accessibility.
6. Cosmetic grants: check exact threshold boundaries, exclusion of invalidated/forfeit/private matches, duplicate claims, ownership/equip enforcement and all profile frames.
7. Portable presets: test copy/paste, clipboard denial, cross-game imports, invalid codes, new modifiers and ranked reset.

## Remaining

Account-synced named preset library, custom sensory round counts and reveal lengths, custom reaction schedules, adaptive sensory timing, secure timed daily memory/audio challenges, richer audio/victory animations. Weekly daily is a points tournament rather than a live bracket. Historical ranked records remain grouped by persisted durations. No live migrations or deployment authorized as part of this candidate.
