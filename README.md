# QuickDuel

Beat strangers in 30-second challenges.

QuickDuel is a production-minded MVP browser game with anonymous entry,
concurrency-safe human matchmaking, a deterministic Memory Grid duel,
server-authoritative scoring/Elo, an all-time leaderboard, and a clearly
labelled unranked Practice Bot.

## Screenshots

Implementation screenshots can be added here after the first connected
deployment. The design references live in `docs/design-references/`.

## MVP features

- Anonymous Supabase Auth with safe generated display names
- Concurrency-safe rating-aware queue with expiry and heartbeat
- Explicit Practice Bot offer after eight seconds; never disguised or ranked
- Synchronized countdown, deterministic 4×4 grid, 1.75s reveal, 12s answer
- Mouse, touch, arrow-key, Space, and Enter controls
- Server-regenerated score, server-measured time, atomic idempotent Elo
- Private per-match realtime subscription with authoritative reload on reconnect
- Two-party rematch, next opponent, Web Share/clipboard fallback
- Top-100 all-time leaderboard with current-player highlighting
- Responsive, high-contrast UI with reduced-motion support
- Structured loading, offline, expiry, configuration, and validation errors

## Stack

Next.js App Router, strict TypeScript, React, Tailwind CSS, Supabase Postgres/Auth/
Realtime, Zod, Vitest, npm, GitHub Actions, and Vercel-compatible serverless
routes. No privileged Supabase key, custom WebSocket server, Redis, worker, or
persistent Node server is required.

## Architecture

The browser is a renderer and input source, not the match authority. Route
handlers authenticate the Supabase session and call narrowly granted
security-definer RPCs. PostgreSQL owns queue locking, challenge verification,
timing, completion, stats, and Elo in transactions. See
[`docs/architecture.md`](docs/architecture.md).

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

The public home and unranked practice mode work without Supabase. Ranked play,
profiles, online activity, and leaderboard data require:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Follow [`docs/setup-supabase.md`](docs/setup-supabase.md) to enable anonymous
Auth, link the project, and run:

```bash
npx supabase db push
```

## Testing

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Connected database verification is documented in
[`docs/testing.md`](docs/testing.md) and `supabase/tests/verification.sql`.

## Deploy

Import the GitHub repository into Vercel, set the same three public environment
variables, deploy, then add the final Vercel URL to Supabase Auth URL
Configuration. Exact steps: [`docs/deploy-vercel.md`](docs/deploy-vercel.md).

## Security model

- No service-role or secret key is used by the application.
- RLS is enabled on every public table.
- Direct queue, match, score, result, rating, and statistics writes are denied.
- Authenticated security-definer functions validate `auth.uid()`, participant
  membership, phase timing, cell bounds/uniqueness, and duplicate submission.
- Match finalization locks the match row and is idempotent.
- Browser anti-cheat is not perfect; the server blocks fabricated outcomes but
  a determined browser user can still inspect delivered challenge data.

## Current limitations

- A live two-user/RLS/realtime test requires a user-owned Supabase project.
- Incomplete matches expire without a rating forfeit.
- Anonymous accounts are device/browser-session scoped until account linking is
  added.
- Match history UI, seasons, more games, moderation tooling, and stronger abuse
  controls are outside this MVP.

## Roadmap

Account linking, CAPTCHA at abuse thresholds, stronger rate limits, abuse
monitoring, audit logs, replay validation, advanced cheat detection, seasonal
leaderboards, and additional skill games.
