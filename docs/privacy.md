# Privacy and account lifecycle

Public profile data is limited to display name, public code, rating/division,
record, and selected cosmetic presentation. Email, OAuth provider identity,
anonymous status, profile UUID, friend graph, blocks, invitations, detailed
match payloads, enforcement state, and analytics rows are not public.

Full match details are participant-only after completion. A player may
deliberately enable a result share; its random code exposes only a small,
completed-result projection and never exposes challenge seeds or submissions.

Anonymous accounts are real Supabase identities stored in the browser. Linking
Google upgrades the same identity so rating and history remain attached.
Clearing browser storage before linking can make an anonymous profile
unrecoverable.

Blocking removes the friendship and pending requests and prevents future
requests, invitations, and private duels between the pair. It does not notify
the blocked user.

Account deletion requires typed confirmation in profile settings. The database
first marks the account deleted, anonymizes display/public identity, removes
social relationships/invitations/cosmetics, disables competitive access, and
preserves non-identifying match records for integrity. The server then deletes
the Supabase Auth user. This is irreversible.

Analytics collection is described in `docs/analytics.md`. Gameplay outcomes are
entertainment statistics, not medical, psychological, aptitude, or intelligence
assessments.
