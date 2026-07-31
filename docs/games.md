# Game registry

The retention release keeps the existing twelve-game registry. It adds no Daily
Challenge and no minigame. Fixed private duels use the same versioned engine;
playlist rounds choose compatible existing games with fresh seeds. Experimental
`reaction_test` and `target_tap` remain unranked.

`src/games/registry.ts` is the authoritative version-1 game engine. Every
definition supplies metadata, deterministic generation, a strict Zod submission
schema, result calculation, comparison-compatible `rankScore`, and a
game-specific Practice Bot. `src/games/client-registry.ts` maps each ID to its
React controller without pulling client code into server scoring routes.

| Game | Playlist | Ranked | Recall/answer window |
| --- | --- | --- | --- |
| Memory Grid | Mind | Yes | 1.75s / 8s |
| Frequency Recall | Sensory | Yes | 2.4s / 12s |
| Colour Recall | Sensory | Yes | 2.6s / 16s |
| Time Recall | Sensory | Yes | 6.5s / 14s |
| Shape Recall | Sensory | Yes | 2.6s / 14s |
| Rhythm Recall | Sensory | Yes | 6.5s / 20s |
| Dot Estimate | Mind | Yes | 2.2s / 7s |
| Number Order | Mind | Yes | — / 12s |
| Odd One Out | Mind | Yes | — / 6s |
| Pattern Complete | Mind | Yes | — / 18s |
| Reaction Test | Experimental | No | — / 18s |
| Target Tap | Experimental | No | — / 16s |

Quick Play includes the ten ranked games. Specific-game preferences match only
within the selected playlist. A rematch keeps the same game but creates a new
seed.

Challenges are keyed by `(game_type, game_version, challenge_seed)`. Never
change a version-1 generator or scoring rule in place after matches exist; add a
new game version so old results remain reproducible.
