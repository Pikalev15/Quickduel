# QuickDuel visual specification

## Direction

QuickDuel is a calm game surface, not a dense dashboard. The default home view
offers one primary action, one secondary action, three suggested games, and a
single collapsed collection. The remaining controls are still available through
the game disclosure, profile drawer, settings popover, leaderboard route, and
matchmaking screen.

The warm-white direction borrows the restraint of focused skill games without
copying another product's branding, layout, or assets. The generated concept in
`docs/design-references/minimal-white-hub-concept.png` was used as a composition
reference; implementation screenshots are in `docs/screenshots/`.

## Tokens

- Background: `#f7f6f2`; surface: `#ffffff`; inset: `#f0efeb`
- Primary text: `#171717`; muted text: `#6d6c67`
- Accent: `#3157d5`; accent ink: `#ffffff`
- Danger: `#b42336`; success: `#237a57`; border: `#deddd8`
- Display and UI type: the bundled sans-serif stack
- Corners: 10–14px on contained surfaces; controls never use decorative clipping
- Motion: 150–180ms with an ease-out curve for direct manipulation

## Hierarchy and disclosure

- The first viewport leads with **Quick play**, then **Choose a game**.
- Suggested games are compact rows. **All games** expands the other nine
  challenges, so all twelve remain one interaction away.
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
- `prefers-reduced-motion` removes non-essential transitions and animations.
- Focus is a visible two-pixel accent outline with a three-pixel offset.
- Minimum interactive target is 44×44px.

## Responsive model

- Desktop uses generous whitespace and keeps controls aligned to a narrow,
  readable content column.
- Mobile stacks the hero actions, removes duplicate header navigation, and turns
  each game row into two full-width actions.
- Game arenas remain centered and inherit the same warm-white palette.
- No horizontal scrolling is permitted at 320px or wider.

## Functional preservation checklist

- Quick matchmaking and playlist/specific-game matchmaking
- Twelve game Practice and Duel paths
- Profile name and accent editing
- Google sign-in/linking capability gate
- Leaderboard route and optional preview
- Online and rating status
- How-it-works content
- Ranked results, rematch, next opponent, share, and home actions
