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

## Vercel website telemetry and admin dashboard

Enable Web Analytics and Speed Insights in the QuickDuel Vercel project dashboard. These packages only mount when NEXT_PUBLIC_VERCEL_ENV is production and the existing analytics preference permits collection. Before-send callbacks check the preference for each event, restrict to public static routes, strip URL parameters and exclude private match, lobby, share and admin paths. Do not enable paid add-ons without reviewing limits.

Admin and analyst roles can access /admin and /api/admin/product-metrics?days=7 or 30. The route explicitly checks the database role before using the service client. It returns only aggregate values, reads a bounded number of rows and fails rather than pretending partial reports are exact. Normal match completion distinguishes recorded normal results from other completed outcomes. Retention is observed gameplay activity with a 30-day lookback, not signup-cohort retention. Placement completion is an all-time count based on the existing five-match requirement.

Web traffic and Web Vitals are available in the Vercel dashboards once enabled. No production database changes are required. A 90-day retention job and server-side aggregate SQL would be useful before increasing the reporting cap.
