# QuickDuel UI roadmap

## Product direction

QuickDuel should feel like a precision sport: immediate, fair, competitive, and
calm under pressure. The interface should use one cobalt accent, cold neutral
surfaces, condensed score typography, and motion only when it explains state or
confirms input.

## Current status - September 2026

- Phase 1 is substantially complete: the shared visual system, responsive home,
  matchmaking states, theme support, press feedback, and route transitions are
  shipped.
- Phase 5 launch essentials are partially complete: metadata, social image,
  manifest, 404, loading state, privacy, terms, robots, sitemap, and analytics
  choice are in place.
- Phase 2 is next. The highest-value work is standardizing the thirteen game
  experiences before adding more visual effects or expanding the game catalog.

## Phase 1: Arena foundation

- Ship the shared color, type, spacing, focus, press, and reduced-motion tokens.
- Redesign the home screen around Quick Play, a live arena preview, and a
  scannable game library without changing the existing routes or game catalog.
- Bring matchmaking into the same visual system and make connection, queue,
  retry, broaden, notification, and bot-practice states visibly distinct.
- Add brief route-level transitions with a faster competitive-flow variant and
  a no-motion path for reduced-motion users.
- Verify desktop and mobile at 1440, 1024, 390, and 320 pixel widths.

## Phase 2: The match loop

- Standardize all thirteen game headers, timers, instruction blocks, stages,
  answer controls, validation, and round transitions.
- Give each game one recognizable visual motif while retaining the shared arena
  frame and cobalt interaction language.
- Audit touch targets, keyboard flow, focus restoration, live regions, reduced
  motion, and color-independent feedback for every game.
- Add visual regression coverage for one sensory, mind, and experimental game.

## Phase 3: Results and progression

- Recompose results around outcome, score evidence, rating movement, and the
  next action in that order.
- Align history, statistics, leaderboard, divisions, seasons, and profile into a
  consistent data language with tabular numerals and comparable row patterns.
- Add earned moments for first win, division promotion, streaks, and personal
  bests. Keep repeat-result motion brief and reserve celebration for rare events.
- Test empty, loading, offline, invalidated, provisional, and partial-data states.

## Phase 4: Social and private play

- Unify friend search, requests, private-duel setup, lobby, series progress,
  rematches, and match chat around a single opponent model.
- Make invite status and lobby readiness obvious without polling noise or
  decorative animation.
- Improve share results with an on-brand image template and accessible fallback
  text.
- Validate invite links, reconnects, duplicate tabs, expired duels, and reports.

## Phase 5: Quality bar

- Maintain unique titles and descriptions, a default social card, icons and web
  manifest, custom 404 and loading states, crawl rules, and a public sitemap.
- Keep privacy, terms, support contact, analytics choice, and account deletion
  aligned with what the deployed product actually does. Do not add consent UI
  for storage that is strictly necessary to authenticate or operate a match.
- Build a small screenshot matrix for light, dark, mobile, desktop, long names,
  localization stress, and reduced motion.
- Track queue abandonment, practice fallback, game selection, rematch, and
  private-duel completion to confirm the redesign improves the real loop.
- Set performance budgets for fonts, first render, interaction latency, and
  layout shift; keep optional effects outside the critical path.
- Run a quarterly accessibility and interaction audit before adding new visual
  patterns.

## Definition of done

A phase is complete only when its happy path, loading, empty, offline, error,
and recovery states are implemented; keyboard and mobile flows are verified;
and screenshots show no overflow, overlap, clipped text, or theme regressions.
