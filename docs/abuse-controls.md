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

Account limits remain the first layer. Ruleset 2 adds an edge layer: trusted
routes use a separate HMAC network
bucket for queue joins, submissions, duel creation, friend requests,
invitations, and match-chat actions. Limits are generous because homes, schools,
carrier NAT, and public Wi-Fi legitimately share addresses. Digests are
short-lived review/throttle inputs, never automatic permanent-ban evidence.

At 70% of a network threshold, anonymous traffic receives an adaptive Cloudflare
Turnstile check. Siteverify and its secret stay server-side. Anonymous accounts
can still play and keep their history/rating, but public rankings require a
linked identity, five ranked human matches, and no restriction. Low opponent
diversity and high-frequency ranked pairs create deduplicated review flags.
These controls raise farming cost; they do not make Sybil abuse impossible.
