# Security model

- Server-authoritative deterministic regeneration and PostgreSQL finalization
  preserve accuracy-first scoring and idempotent Elo.
- RLS is enabled on all new tables. Direct table privileges are revoked for
  private duel, social, analytics, enforcement, audit, progression, and cosmetic
  state; clients receive narrow authenticated RPC grants.
- Security-definer functions use a fixed empty `search_path`, validate
  `auth.uid()`, and own race-sensitive joins/updates transactionally.
- History detail is participant-only; public shares are explicit projections.
- Admin authorization is database-backed and rechecked per action.
- The Supabase secret and optional observability DSN are server-only.
- Account-level rate limits and enforcement are database-owned.

Browser anti-cheat remains bounded: rendered/audio stimuli can be recorded.
There is no claim of high-stakes cheat resistance. See
`docs/fairness-limitations.md` and `docs/abuse-controls.md`.

Server routes trust Vercel's `x-vercel-forwarded-for` metadata only when running
on Vercel. The address is immediately HMAC-SHA-256 hashed with the server-only
`RATE_LIMIT_HASH_KEY`; raw addresses are never sent to PostgreSQL or returned to
the browser. Network buckets expire after two windows and cannot permanently ban
an account.

Turnstile is adaptive. Siteverify runs server-side with
`TURNSTILE_SECRET_KEY`, has a five-second timeout, and fails closed when a
production challenge is required. `ABUSE_CHALLENGE_DEV_BYPASS=true` is explicit
local development only.

Expected submission failures use stable `QD_*` identifiers in PostgreSQL error
detail. A central allowlist maps them to safe HTTP responses. Participant RLS
and bilateral block checks protect match chat.
