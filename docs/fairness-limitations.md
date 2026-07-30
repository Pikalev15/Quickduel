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

The MVP does not include replay telemetry, device attestation, anomaly
detection, moderation, CAPTCHA, or bans. A production competitive season should
add those controls, rate limits, abuse monitoring, and a documented appeals
process before awarding material prizes.
