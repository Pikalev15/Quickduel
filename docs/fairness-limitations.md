# Fairness and limitations

QuickDuel prevents the easiest outcome fabrication:

- Challenge seeds are excluded from participant table grants and snapshots.
- Ranked submissions are validated and scored on the server.
- Completion time comes from PostgreSQL, not a browser timer.
- Result writes require a server-only modern Supabase secret.
- Match finalization locks its row and is idempotent.
- Accuracy is primary, so blind speed does not beat a better answer.

Web games cannot make observable stimuli secret. A player can record a visible
grid, colour, shape, dot field, puzzle, or audible sequence. Browser automation,
display/audio capture, network latency, device refresh rate, input hardware, and
accessibility needs also affect comparisons. Reaction Test and Target Tap are
therefore experimental and unranked.

The product includes review flags, enforcement states, adaptive CAPTCHA, and
match-chat reporting, but not replay telemetry or device attestation. A
production competition with material prizes would still require stronger
moderation staffing, an appeals process, and additional anti-cheat evidence.

Network HMAC buckets and provisional rankings reduce cheap anonymous rotation,
but shared-network false positives require generous limits and sophisticated
attackers can change networks. Turnstile raises automation cost; it does not
prove one human equals one account.

If the scheduler or database is unavailable, timeout finalization is delayed
rather than guessed by the browser. Service outages around a deadline can still
require operational review. Sensory and visual challenges can be recorded,
replayed, or analyzed by browser automation; this remains a casual ranking
system, not high-stakes cheat resistance.
