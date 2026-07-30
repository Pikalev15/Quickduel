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
