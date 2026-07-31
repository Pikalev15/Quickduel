# Observability

Every API success/error can carry a correlation ID. Route failures emit
structured JSON with timestamp, level, deployment, route, event, correlation ID,
and safe entity references. Production logs omit stack traces and do not include
request bodies, auth tokens, challenge seeds, submissions, or private result
payloads.

Vercel's native function metrics provide route latency and status-code/error-rate
aggregation. Structured events classify auth, matchmaking, private-duel,
share-card, database RPC, client-runtime, and Realtime-channel failures so those
metrics can be filtered without a vendor-specific SDK.

`GET /api/health` reports application and backend configuration/latency.
`POST /api/errors` accepts a validated, size-limited client error report.
`global-error.tsx` gives users a recoverable application-level failure screen.

Set optional server-only `OBSERVABILITY_DSN` to an HTTPS ingestion endpoint if
external error delivery is required. Delivery times out after 1.5 seconds and a
reporting failure does not replace the original application response. Without a
DSN, Vercel structured logs remain the source of truth.

Alert recommendations: health failures, API error-rate increase, queue latency,
unusual result-submission rejection, repeated observability delivery failure,
and migration/RLS test failure.
