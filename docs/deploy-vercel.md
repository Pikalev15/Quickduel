# Deploy to Vercel

Do this after ranked play works locally with Supabase.

1. Sign in to [Vercel](https://vercel.com) with GitHub.
2. Choose **Add New → Project**.
3. Import the private `Pikalev15/quickduel` repository and grant Vercel access if
   requested.
4. Confirm Vercel detects **Next.js**. Keep the repository root as the project
   root and use the default build command.
5. Add these variables to **Production, Preview, and Development**:

   - `NEXT_PUBLIC_SUPABASE_URL`: the Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the public publishable key
   - `NEXT_PUBLIC_APP_URL`: initially `https://YOUR-PROJECT.vercel.app`
   - `SUPABASE_SECRET_KEY`: a modern `sb_secret_` key, marked **Sensitive** in
     Production and Preview. Never prefix it with `NEXT_PUBLIC_`.
   - `OBSERVABILITY_DSN`: optional server-only HTTPS error-ingestion endpoint.
   - `RATE_LIMIT_HASH_KEY`: at least 32 random bytes, server-only.
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: Turnstile public widget key.
   - `TURNSTILE_SECRET_KEY`: Turnstile Siteverify secret, marked Sensitive.
   - `CRON_SECRET`: at least 16 random bytes, marked Sensitive.
   - `ABUSE_CHALLENGE_DEV_BYPASS`: unset or `false` outside local development.

6. Deploy. Copy the exact generated `vercel.app` URL.
7. If it differs from the value used above, update `NEXT_PUBLIC_APP_URL` and
   redeploy from **Deployments**.
8. In Supabase **Authentication → URL Configuration**, set the production Site
   URL and add `https://YOUR-PROJECT.vercel.app/**` to allowed redirect URLs.
9. Configure Google under Supabase **Authentication → Providers → Google** if
   account linking should be live. The Google Client Secret belongs only in
   Supabase, not Vercel.
10. Test anonymous sign-in and matchmaking from two separate browsers/devices.
11. Confirm a push to `main` creates a new production deployment.

The free `vercel.app` domain is sufficient for the MVP. No custom domain or
server process is required.

Apply and verify Supabase migrations before deploying code that calls the new
RPCs. Back up the database, dry-run/lint, apply
`202607310001_retention_social_progression.sql`, deploy to Preview, and run the
two-browser owner checklist in `docs/testing.md` before promotion. Confirm
`/api/health`, OAuth, anonymous auth, private series, result-card images, and
structured logs. No payment, analytics-vendor, Redis, paid worker, or custom
WebSocket service is added; Vercel Cron and the existing Supabase Realtime
service are used.

## Ranked-integrity rollout

1. Take a Supabase backup or snapshot.
2. Run `npx supabase db push --dry-run` and
   `npx supabase db lint --linked --level warning`.
3. Apply `202607310002_ranked_integrity_and_match_chat.sql`. Existing matches
   remain ruleset 1.
4. Deploy the branch to Preview, run automation, and complete the two-browser
   timeout matrix.
5. Promote the exact tested artifact to Production.
6. Confirm the minute cron from `vercel.json` is enabled. Vercel authenticates
   it with `Authorization: Bearer $CRON_SECRET`.
7. Monitor `integrity_runtime.last_expiry_sweep_at`, finalization errors, timeout
   counts, rating audit entries, and abuse flags.

Rollback code by promoting the previous Vercel artifact. Disable the cron before
database rollback. Additive fields/tables may remain; setting the match
`ruleset_version` default back to 1 stops new penalties. Do not drop the
migration while ruleset 2 matches exist.
