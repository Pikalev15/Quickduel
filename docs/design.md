# QuickDuel visual specification

## Direction

QuickDuel is a calm game surface, not a dense dashboard. The default home view
offers one primary action, one secondary action, three suggested games, and a
single collapsed collection. The remaining controls are still available through
the game disclosure, profile drawer, settings popover, leaderboard route, and
matchmaking screen.

The arena direction borrows the restraint of focused skill games and the visual
cadence of modern sport graphics without copying another product's branding,
layout, or assets. The home screen pairs the live product controls with a
representative match state so the game itself is visible before the first click.

## Tokens

- Background: `#f3f5f8`; surface: `#ffffff`; inset: `#e9edf3`
- Primary text: `#101318`; muted text: `#626a76`
- Accent: `#3157d5`; accent ink: `#ffffff`
- Danger: `#b42336`; success: `#237a57`; border: `#deddd8`
- Display type: bundled Open Sans Condensed ExtraBold; UI type: bundled Red Hat Display
- Corners: 8px on contained surfaces; controls never use decorative clipping
- Motion: 150–180ms with an ease-out curve for direct manipulation

## Hierarchy and disclosure

- The first viewport leads with **Quick play**, then **Choose a game**.
- Suggested games are compact rows. **All games** expands the other ten
  challenges, so all thirteen remain one interaction away.
- Interface settings persist locally and can keep the full library, leaderboard
  preview, or three-step explanation visible.
- Profile customization and Google account linking remain in the profile drawer.
- Playlist and specific-game selection remain on `/play`; direct Practice and
  Duel actions remain on every game row.
- Accuracy is the primary outcome. Trusted server time is shown as the
  tiebreaker, never marketed as a reason to answer carelessly.

## Interaction rules

- Show motion only when it explains origin, hierarchy, or state change.
- Use CSS transitions for hover, press, popover, and disclosure interactions.
- Buttons press to `scale(0.97)` and return with a short ease-out transition.
- Hover effects are enabled only on fine pointers.
- Popovers and disclosures originate from their trigger and finish within
  180ms.
- Home composition and rare result headings may enter once with a 200-280ms
  ease-out. Repeated game controls, keyboard actions, and answer input never wait
  for animation.
- Hover motion belongs to the child mark or arrow, not the hit target, avoiding
  pointer-boundary flicker.
- `prefers-reduced-motion` removes non-essential transitions and animations.
- Focus is a visible two-pixel accent outline with a three-pixel offset.
- Minimum interactive target is 44×44px.
- Interface emphasis uses weight or the cobalt accent; italic is reserved for
  prose stress rather than UI hierarchy.
- Scores, ratings, timers, ranks, and other comparable figures use tabular
  numerals.

## Responsive model

- Desktop uses generous whitespace and keeps controls aligned to a narrow,
  readable content column.
- Mobile stacks the hero actions, removes duplicate header navigation, and turns
  each game row into two full-width actions.
- Game arenas remain centered and inherit the same warm-white palette.
- No horizontal scrolling is permitted at 320px or wider.

## Functional preservation checklist

- Quick matchmaking and playlist/specific-game matchmaking
- Thirteen game Practice and Duel paths
- Profile name and accent editing
- Google sign-in/linking capability gate
- Leaderboard route and optional preview
- Online and rating status
- How-it-works content
- Ranked results, rematch, next opponent, share, and home actions
