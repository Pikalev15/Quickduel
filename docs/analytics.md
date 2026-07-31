# Product analytics

QuickDuel records first-party product events in Supabase. Events cover landing,
anonymous auth, OAuth linking, onboarding, play/queue/match/rematch, private
duels, history/stats/seasons, friends/invitations, and result sharing. Analytics
delivery is best effort (`sendBeacon` with a keepalive fallback) and cannot block
match completion.

Stored context is deliberately coarse: random session ID, authenticated profile
ID when available, event name, game/playlist/match reference, device class,
referrer category, optional duration, and a capped 4 KB property object. It does
not collect raw IP addresses, emails, provider tokens, fingerprints, keystrokes,
pointer traces, audio, challenge answers, or arbitrary URLs.

`get_analytics_report` is database-role protected and returns aggregates for the
admin screen. Direct client reads of `analytics_events` are revoked.

There is no environment variable for analytics retention because the repository
does not yet install a scheduler. Before a broad launch, the owner should add a
Supabase scheduled deletion policy (recommended: 90 days) and document the
chosen retention period in the public privacy policy.
