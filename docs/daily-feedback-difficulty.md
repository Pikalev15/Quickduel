# Daily Duel, feedback, results and difficulty

Development candidate stacked on timing PR #14. No production migration or release.

A: existing recall feedback keeps target/guess and signed errors. Frequency uses a logarithmic pitch comparison; both recall games explain the largest error. No opponent answer is exposed before both are resolved.

B: result verdict and score hierarchy, paired five-round bars, precise existing breakdown and share image bars. Missing rows are unavailable rather than fabricated zeroes. Existing opt-in sharing only.

C: Daily Duel v1 is six shared Pattern Complete puzzles generated from a database-held random seed per UTC date. One attempt per authenticated profile; 45s with a one-second submission transport grace. Partial answers count, same scores share rank, no Elo. No client-supplied score or seed. Guest sessions are allowed via existing profile bootstrap; this is unranked, not proof against bots, alternate accounts or board sharing. Active reload resumes the original deadline but resets unsent selections. Starting consumes the attempt. No daily leaderboard data until the staged SQL is installed on an isolated database. Verify account-state enum, service-only privileges, midnight rollover, concurrent starts/submissions, expiration and deletion exclusion before promoting SQL. The public top 100 may truncate tied rows.

D: Easy/Standard/Expert practice setup for all registered games; changes exposure, answer budgets, response window or word length as appropriate. Standard follows timing PR. No ranked settings changed. Onboarding always uses standard. Real-device layout/audio checks remain required.

Do not merge or deploy production. PR #13 navigation and accents are parallel; reconcile before integration.
