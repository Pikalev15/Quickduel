# Retention, social, and progression implementation inventory

This inventory records the production baseline inspected on 31 July 2026 before
feature code was changed. It is the implementation map for
`feat/retention-social-progression`.

## Repository and deployment baseline

- Production: `https://quickduel-nu.vercel.app`
- Framework: Next.js App Router, React, strict TypeScript, Tailwind CSS
- Data plane: Supabase Auth, Postgres, RLS, Realtime
- Deployment: Vercel
- Tests: Vitest plus SQL verification; no committed browser runner yet
- GitHub CI: lint, typecheck, unit tests, and production build
- Working tree was clean on `main` at `7997995` before this branch was created.

The live desktop and 390 px mobile home page were inspected. The current visual
system is deliberately quiet: warm light background, a compact brand header,
one dominant Quick Play action, three suggested games, and secondary settings,
profile, and leaderboard affordances. New surfaces must reuse this system and
keep the home page focused.

## Current domain model

### Profiles and authentication

- `profiles` is keyed directly to `auth.users.id`.
- Supabase creates anonymous sessions; `ensure_profile()` is idempotent.
- Google sign-up upgrades an anonymous user through `linkIdentity`.
- Existing-account login uses `signInWithOAuth`.
- Display names are currently globally unique and validated in
  `update_profile`; the new model needs non-unique names plus a unique public
  code.
- Profiles store rating, aggregate ranked record, and one of five free accents.
- The service-role secret is server-only. Client code receives the publishable
  key only.

### Matchmaking

- One queue row per profile prevents a user from occupying multiple queue
  entries.
- `join_matchmaking` and `heartbeat_matchmaking` are security-definer functions
  with a fixed empty `search_path`.
- Matching is transactional, row-locked, uses `skip locked`, and broadens only
  by rating difference over elapsed time.
- Queue preferences are playlist plus optional game. Current compatibility can
  match a specific-game user to a playlist user.
- Existing active matches are rejoined.
- The browser heartbeats every five seconds and queue rows expire after twenty.
- A clearly labelled Practice Bot is offered after eight seconds.
- There is no consent-based game/playlist broadening, tab lease, queue activity
  breakdown, or browser notification flow yet.

### Matches, scoring, and rematches

- Twelve games are registered in a deterministic server/client registry.
- Ten games are ranked; Reaction Test and Target Tap are experimental unranked.
- Challenge seeds are stored in `matches` and never included in participant
  table grants.
- The server regenerates challenges, validates submissions with each game's Zod
  schema, computes the result, and records it with a service-role-only RPC.
- `submit_game_result` locks the match and rejects duplicate submissions.
- `finalize_match_locked` is idempotent under the match-row lock.
- Elo is changed exactly once for ranked matches. Experimental matches keep
  rating unchanged.
- `game_stats` updates for completed human matches. Existing aggregate profile
  record updates only for ranked matches.
- Match snapshots hide the opponent's result until completion.
- Rematches require both players within sixty seconds and create a fresh seed.
- There is no match source, private series context, history cursor, season
  accounting, or abuse review record yet.

### Current data access and RLS

- RLS is enabled on every existing public table.
- Participants can read only deliberate match columns and their own player row.
- Direct queue, result, rating, and statistics writes are not granted.
- Public leaderboard and public activity are narrow security-definer RPCs.
- Participant-only snapshot access is checked by `is_match_participant`.
- New private surfaces must continue to use narrow RPCs rather than raw table
  reads and must not return challenge seeds or in-progress opponent payloads.

## Current application surfaces

- `/`: home, progressive game library, account controls, optional leaderboard
- `/play`: public human queue
- `/match/[matchId]`: authoritative human match
- `/match/practice`: local deterministic Practice Bot
- `/leaderboard`: top 100 permanent Elo standings
- `/auth/callback`: Supabase OAuth exchange
- API routes cover profile, overview, leaderboard, queue, match snapshot,
  readiness, submission, and rematch.

Most feature UI is already split into focused components, but shared
authenticated navigation and server error/correlation handling are minimal.

## Existing test coverage

- All twelve challenge generators and submission schemas
- Game scoring and accuracy-before-speed comparison
- Practice Bot payloads
- Elo symmetry, bounds, and draws
- Request validation
- SQL checklist for queue concurrency, duplicate submission, participant
  authorization, function grants, expired queue cleanup, and reconnect snapshots

Missing coverage is exactly where the expansion is concentrated: browser E2E,
private duels, history privacy, progression, seasons, friends, blocks, admin
authorization, analytics, rate limits, deletion, and share images.

## Implementation map

### Database and compatibility layer

One additive migration will introduce:

- public profile codes and progression fields
- private duel/series metadata attached to normal `matches`
- cursor-based participant history and detail RPCs
- richer aggregate/per-game statistics
- weekly season definitions, points, archives, and pair/day farming limits
- symmetric friendships, requests, blocks, and duel invitations
- onboarding progress
- analytics events and reporting functions
- rate-limit buckets, abuse flags, enforcement, and audit log
- database-backed admin roles
- cosmetics catalogue, ownership, and equipped selections
- account deletion/anonymisation

Functions remain fixed-`search_path`, minimally granted, and transactional. The
existing `matches` and `match_players` rows remain authoritative; no duplicate
history table will copy private challenge payloads.

### Product APIs

Add narrow routes for:

- private duel create/read/join/leave and series continuation
- history list/detail and personal statistics
- seasons and public seasonal standings
- friend search/requests/relationships/blocks/invitations
- onboarding state
- analytics ingestion and admin reporting
- account deletion and cosmetic selection
- admin moderation actions
- safe health and structured client-error reporting
- server-rendered Open Graph result cards

All mutating routes validate with Zod and call database functions. Important
responses and logs carry correlation IDs.

### UI and navigation

- Keep Quick Play primary; add Private Duel as the secondary home action.
- Add compact primary navigation for Play, Friends, History, Leaderboard, and
  Profile, with Seasons and Stats progressively disclosed.
- Add focused routes for duel lobbies, history/detail, stats, seasons, friends,
  onboarding, profile settings, and admin.
- Reuse the existing typography, palette, borders, open-list composition,
  reduced-motion support, dark/light/system themes, and mobile breakpoints.
- Do not add a dense dashboard, daily challenge, new game, public social feed,
  chat, payments, advertising, or gameplay-affecting cosmetics.

### Verification gates

- Static: lint, typecheck, unit tests, production build
- Database: local reset/test where available, linked dry-run, and linked lint
- Browser: desktop and mobile, public/anonymous/linked/admin states where
  credentials permit, plus screenshots and overflow/focus/theme checks
- Security: unrelated history denial, participant-only detail, admin denial,
  direct-rating denial, rate limiting, audit creation
- Publishing: logical commits, push this branch, and open a draft PR into
  `main`; never merge automatically

## Known baseline risks

1. The local repository has no Playwright package or E2E harness.
2. Google OAuth cannot be fully automated without provider credentials.
3. Live two-user verification mutates the linked Supabase project; destructive
   tests must use disposable identities and avoid production history.
4. `latest` dependency ranges reduce reproducibility and should not be expanded
   casually.
5. A complete product layer is safest as additive schema plus narrow RPCs; a
   rewrite of matchmaking or scoring would create unnecessary regression risk.
