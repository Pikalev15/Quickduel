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
