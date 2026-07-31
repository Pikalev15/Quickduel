# Private duels

Private duels are short-lived, shareable sessions at `/duel/[code]`. A host can
select one of the existing games or a playlist, choose single game/best-of-3/
best-of-5, and opt into ranked play. Codes are random eight-character values;
participant UUIDs are never placed in the URL.

`create_private_duel`, `join_private_duel`, and `leave_private_duel` are
transactional, authenticated security-definer functions. They reject self-joins,
duplicate guests, blocked pairs, expired sessions, and concurrent claims of the
same guest slot. A link expires after 24 hours. Invitations expire after 30
minutes.

Anonymous profiles can host and join unranked duels. Ranked creation requires a
non-anonymous identity; the join path checks the same constraint for the guest.
Every match stores its source and series round, and every round gets a fresh
challenge seed. Fixed-game series retain the game; playlist series select a
compatible game per round. Elo changes only when the persisted duel and match
are explicitly ranked.

The states are `waiting`, `ready`, `active`, `completed`, `expired`, and
`cancelled`. The database completion trigger advances the score and creates the
next match until either player reaches the wins required by the format.

Known limitation: end-to-end concurrency and series rollover require a migrated
live Supabase project and remain an owner smoke test; the local browser suite
uses deterministic API fixtures.
