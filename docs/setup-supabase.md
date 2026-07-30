# Supabase setup

These steps use only the public project URL and publishable key in the app. Never
put a secret or `service_role` key in `.env.local`, chat, GitHub, or browser code.

## 1. Create and configure the project

1. Create a free project at [Supabase](https://supabase.com/dashboard).
2. In the project dashboard, open **Authentication → Providers → Anonymous
   Sign-Ins** and enable anonymous sign-ins.
3. Open **Project Settings → General** and copy the project reference ID.
4. Initialize and log in with the current Supabase CLI:

   ```bash
   npx supabase@latest init
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   `init` creates the local `supabase/config.toml`; it does not replace the
   committed migration or seed files.

5. Preview and apply the versioned schema:

   ```bash
   npx supabase db push --dry-run
   npx supabase db push
   ```

   If CLI linking is unavailable, open **SQL Editor → New query**, paste
   `supabase/migrations/202607300001_initial_quickduel.sql`, and run it once.

## 2. Configure local public values

In **Project Settings → API**, copy:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key (not a secret/service-role key) →
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Create `.env.local`:

```bash
cp .env.example .env.local
```

Then fill it locally:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Restart `npm run dev` after changing environment variables.

## 3. URL settings

In **Authentication → URL Configuration**:

- Set **Site URL** to `http://localhost:3000` while testing locally.
- Add `http://localhost:3000/**` as a redirect URL if the dashboard requires it.
- Later add `https://YOUR-VERCEL-PROJECT.vercel.app/**`.

Anonymous sign-in does not use an OAuth redirect in the current app, but keeping
the approved app origins accurate prevents future auth-linking surprises.

## 4. Verify

1. Press Play. In **Authentication → Users**, confirm an anonymous user exists.
2. In **Table Editor**, confirm its profile exists with rating 1000.
3. Confirm RLS is enabled on `profiles`, `matchmaking_queue`, `matches`, and
   `match_players`.
4. Confirm `matches` and `match_players` are in the `supabase_realtime`
   publication and that the two match-participant policies exist on
   `realtime.messages`.
5. Open the site normally and in an incognito window. Press Play in both.
6. Confirm both sessions receive the same match ID and grid pattern.
7. Submit both answers and confirm one completed match, two result rows, and one
   rating application.

Use `supabase/tests/verification.sql` for the duplicate, authorization, expiry,
and reconnect cases.
