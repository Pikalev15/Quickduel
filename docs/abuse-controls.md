# Abuse controls

Database rate-limit buckets protect queue writes, profile updates, private-duel
creation/joining, result-card creation, friend search/requests, and invitations.
Result submissions also use a bounded server-side gate. Queue access checks the
effective enforcement state before creating or retaining a ranked queue row.

Signals cover impossible completion time, duplicate submissions, repeated
perfect scores, repeated identical payloads, repeated queue cancellation,
invitation bursts, and ranked-pair repetition past the daily season cap.
Invalidated matches, enforcement changes, and rating finalizations produce
immutable audit entries. Signals are review inputs, not proof: no single
automated flag applies a permanent ban.

Enforcement states are normal, warning, ranked restricted, temporary suspension,
and manual ban. Restrictions are checked in database functions, not only in the
UI. Blocks are bilateral for social/duel interaction but do not reveal who
blocked whom.

Current limits are account based. Excessive account creation and cross-account
simultaneous sessions cannot be safely correlated without edge data or invasive
fingerprinting, so they are not automatically flagged in this release. IP-layer
throttling/CAPTCHA should be added at the edge only if public abuse warrants it.
