# Divisions and weekly seasons

Divisions are a display layer over the existing Elo value:

| Division | Minimum Elo |
| --- | ---: |
| Bronze | 100 |
| Silver | 800 |
| Gold | 1000 |
| Platinum | 1200 |
| Diamond | 1400 |
| Master | 1600 |

The thresholds are centralized in `src/lib/divisions.ts`; divisions never
replace or independently modify Elo.

Seasons are seven-day UTC windows identified by their Monday start date. The
current definition is created lazily by `current_season_id`. Completed, valid,
ranked human matches award 3 points for a win and 1 for a draw. At most three
ranked matches between the same pair count per UTC day, limiting friend farming.
The indexed leaderboard orders by points, wins, then earliest update.

Season rollover creates a new row and new player totals; all-time Elo and match
history continue unchanged. Historical season routes remain readable. Rewards
are represented by progression/cosmetic grants but no paid rewards or shop are
implemented.
