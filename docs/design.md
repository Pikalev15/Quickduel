# QuickDuel visual specification

## Direction

QuickDuel is a compact competitive game surface, not a marketing site or a
dashboard. The visual language is an open near-black arena with acid-lime
competition cues, cut-corner controls, condensed display type, and a restrained
4×4 grid motif.

Reference concepts:

- `docs/design-references/home-concept.png`
- `docs/design-references/game-result-concept.png`

## Tokens

- Background: `#050b14`; raised surface: `#091321`; inset: `#07101c`
- Primary text: `#f5f7f2`; muted text: `#9aa6b5`
- Accent: `#d7ff00`; accent ink: `#071000`
- Danger: `#ff5263`; success: `#d7ff00`; border: `#263345`
- Display type: bundled Open Sans Condensed ExtraBold
- UI type: bundled Red Hat Display variable
- Corners: 0–8px, with clipped corners on primary controls
- Motion: 120–240ms for controls, 360ms for screen entrances; no motion when
  `prefers-reduced-motion` is enabled

## Component rules

- Header is quiet: wordmark, activity, and leaderboard navigation only.
- The home CTA is the largest control. It is the sole strong glow.
- Major layouts remain open. Borders divide regions; cards are reserved for
  errors, results comparison, and table containment.
- Buttons use uppercase condensed text. Primary is solid acid-lime; secondary
  is transparent with a one-pixel border.
- Grid cells are square, high-contrast, touch-friendly, and use the accent fill
  only for reveal or selected states.
- Status is communicated with text and a dot, never color alone.
- Keyboard focus is a two-pixel warm-white outline with a three-pixel offset.

## Responsive model

- Desktop keeps the home loop and leaderboard side by side; the game grid is
  centered in an open arena.
- Mobile collapses information to one column, keeps the 4×4 grid within the
  viewport, and turns result actions into a vertical stack.
- Minimum interactive target is 44×44px. No horizontal scrolling is allowed at
  320px.

## Copy lock

The first viewport uses only: `QUICKDUEL`, `Beat strangers in 30-second
challenges.`, `PLAY NOW`, `RATING`, `ONLINE`, `MATCH`, `PLAY`, `CLIMB`, and
`VIEW LEADERBOARD`, plus live values. No eyebrow, promotional badge, or
secondary hero claim is permitted.
