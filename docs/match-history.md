# Match history and personal statistics

`/history` loads completed human matches with a `(completed_at, id)` cursor.
Each row includes the opponent's public identity, outcome, game, ranked state,
rating delta, validated summaries and timings, source, and series round.
`/history/[matchId]` adds the completed answer, both validated submissions and
results, rating before/after, version, timing, and series context.

`get_match_history_detail` requires the caller to be a participant and requires
the match to be complete. Public share and leaderboard functions are separate
projections and do not expose submissions, results JSON, challenge seeds, email,
provider identity, or UUID-based profile links.

`/stats` shows overall record, rating/highest rating, division, streaks, recent
form, and per-game played/win/loss/draw, best rank score, best time, averages,
and recent results. Per-game labels come from each game's scoring direction;
there is no universal “higher is better” assumption.

The `matches_participant_history_idx` completion index and cursor limit of 50
avoid offset scans. The route defaults to 20 rows.
