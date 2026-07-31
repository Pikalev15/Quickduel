# Game registry

QuickDuel has thirteen active games and two immutable legacy recall versions.
`src/games/registry.ts` is the authoritative deterministic engine. Every entry
defines a numeric version, seeded generator, strict Zod submission schema,
server-side result calculation, and game-specific Practice Bot.
`src/games/client-registry.tsx` maps all fifteen resolvable IDs to React
controllers without importing client code into scoring routes.

New matchmaking, Quick Play, Practice, and private-duel selection use only the
thirteen active IDs. `frequency_recall` v1 and `colour_recall` v1 remain
resolvable solely so open and historical matches retain their original
generator, schema, and scoring behavior.

| Game ID | Version | State | Playlist | Ranked | Format |
| --- | ---: | --- | --- | --- | --- |
| `memory_grid` | 1 | Active | Mind | Yes | 1.2s flash + 1.75s hold / 8s answer |
| `frequency_recall` | 1 | Legacy | Sensory | Yes | Three-tone batch; 2.4s / 12s |
| `frequency_recall_v2` | 2 | Active | Sensory | Yes | Five sequential rounds / 30s total |
| `colour_recall` | 1 | Legacy | Sensory | Yes | Three-colour batch; 2.6s / 16s |
| `colour_recall_v2` | 2 | Active | Sensory | Yes | Five sequential rounds / 40s total |
| `time_recall` | 1 | Active | Sensory | Yes | 6.5s / 14s |
| `shape_recall` | 1 | Active | Sensory | Yes | 2.6s / 14s |
| `rhythm_recall` | 1 | Active | Sensory | Yes | 6.5s / 20s |
| `dot_estimate` | 1 | Active | Mind | Yes | 2.2s / 7s |
| `number_order` | 1 | Active | Mind | Yes | Immediate / 8s |
| `odd_one_out` | 1 | Active | Mind | Yes | Immediate / 6s |
| `pattern_complete` | 1 | Active | Mind | Yes | Immediate / 18s |
| `typing_sprint` | 1 | Active | Mind | Yes | Fixed 15-second test |
| `reaction_test` | 1 | Active | Experimental | No | Immediate / 18s |
| `target_tap` | 1 | Active | Experimental | No | Immediate / 16s |

Quick Play contains the eleven active ranked IDs. The Sensory and Mind
playlists use the active v2 recall modes and Typing Sprint. A rematch preserves
the exact game ID and version while generating a fresh seed.

## Memory Grid timing

The six highlighted cells flash for 1.2 seconds, followed by a 1.75-second
blank retention interval where the board remains locked. The full eight-second
answer window begins only after that hold. Ranked matches persist the combined
2.95-second reveal window so both players see the same server-authoritative
schedule; already-created matches retain their stored timing.

## Frequency Recall v2

Five seeded pitches are reconstructed sequentially. Each round automatically
presents one tone, hides it after a short local reveal, and accepts one
continuous 120–2000Hz slider answer before advancing. The server calculates all
five guesses together.

The existing log-octave error metric is converted to a bounded 0–10 score per
round. Five round scores sum to a primary 0–50 result. The v1 three-tone
generator, length-three schema, and proportional-error scoring are unchanged.

## Colour Recall v2

Five seeded OKLCH colours are reconstructed sequentially. Each local round
briefly shows one swatch, then accepts lightness, chroma, and hue before
advancing. The existing normalized OKLCH distance remains the basis for a
bounded 0–10 round score; five rounds sum to a primary 0–50 result.

The complete seeded target arrays are delivered to the game controller so it
can run round-local reveal phases inside the single authoritative match answer
window. This preserves deterministic server scoring, but a determined browser
user can inspect client-delivered stimuli; the modes are not cheat-proof.

## Typing Sprint

`typing_sprint` is an active ranked Mind game and QuickDuel's explicit
speed-focused exception:

> Type quickly and accurately. Errors reduce your WPM.

Both players receive the same deterministic sequence of 120 words selected from
QuickDuel's original 385-word lowercase vocabulary. Adjacent duplicates are
prevented. The passage stays visible throughout the fixed 15-second answer
window and is intentionally much longer than a player should finish.

The browser shows live WPM, accuracy, errors, remaining time, current word,
current character, correct characters, incorrect characters, and extra
characters. These values are display-only. Paste, drag-and-drop, control
characters, tabs, newlines, oversized payloads, and unsupported characters are
blocked or rejected. The server regenerates the target and recalculates the
result using the fixed authoritative duration; submitting early cannot increase
ranked WPM.

### Word-aware comparison

1. Collapse repeated spaces and compare word attempts by word index.
2. Matching positions count as correct characters.
3. Substitutions and extra characters count as incorrect.
4. Missing characters count as incorrect only after that word is completed.
5. The untyped suffix of the final active word is not an error.
6. Untouched future words are never errors.

This prevents one insertion from shifting every later character.

For the fixed 15-second duration:

```text
gross WPM = normalized typed characters / 5 / 0.25 minutes
net WPM   = max(0, (correct characters - incorrect characters) / 5 / 0.25)
accuracy  = correct / max(1, correct + incorrect)
```

Net WPM is the primary ranked score. Accuracy, correct characters, fewer
incorrect characters, and trusted receipt timing resolve otherwise equal
results in that order. Practice Bot output is seeded, targets a plausible normal
typing range, introduces bounded mistakes, and uses the same scoring path.

The hidden accessible input disables autocorrect, capitalization, spellcheck,
paste, and drop where browser APIs allow. Tapping the surface focuses mobile
input, but software and hardware keyboards are not scientifically equivalent.
Browser automation remains possible. Very high near-perfect results create a
review signal rather than an automatic ban.

## Version contract

Challenges are keyed by `(game_type, game_version, challenge_seed)`.
`GameDefinition.version` accepts numeric versions, but the database permits only
explicit supported pairs:

- `frequency_recall_v2` and `colour_recall_v2` require version 2;
- every other current or legacy ID, including `typing_sprint`, requires version
  1.

Never change a released generator, submission schema, or scoring function in
place. Add a new ID/version pair so historical matches remain reproducible.
