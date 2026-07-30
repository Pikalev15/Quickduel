# Scoring and comparison

Every game calculates a scalar `rankScore` where larger is better. Ranked
comparison is intentionally lexicographic:

1. Compare correctness, accuracy, or the game’s defined error metric.
2. Only when `rankScore` is equal within `0.000001`, compare the database’s
   trusted completion time.
3. Times within 10ms are a draw.

This is not “fastest click always wins.” Making time primary would make random
submission the rational strategy and would stop measuring the named skill.

Examples:

- Memory Grid: correct cells minus 0.5 per incorrect cell, then time.
- Recall games: negative perceptual/proportional error, then time.
- Number Order: trusted time plus 750ms per ordering error.
- Odd One Out: correct selection, then time.
- Pattern Complete: correct count, then time.
- Experimental games produce results and per-game stats but no Elo delta.

The client sends only a schema-validated submission. The Next.js server
regenerates the private challenge using the database seed, computes the result,
and calls a service-role-only RPC. PostgreSQL measures completion time, locks
finalization, compares both player rows, and applies Elo once.
