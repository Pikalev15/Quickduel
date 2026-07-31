# Supabase setup

The browser uses only the project URL and publishable key. Ranked scoring also
requires a modern `sb_secret_` key in the Next.js server environment. Never use
that key in a `NEXT_PUBLIC_*` variable, browser code, chat, or GitHub.

## 1. Create and configure the project

1. Create a free project at [Supabase](https://supabase.com/dashboard).
2. Open **Project Settings → General** and copy the project reference ID.
3. Initialize and log in with the current Supabase CLI:

   ```bash
   npx supabase@latest init
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

   `init` creates the local `supabase/config.toml`; it does not replace the
   committed migration or seed files.

4. Review and push the tracked project configuration:

   ```bash
   npx supabase config push
   ```

   This enables anonymous sign-ins and configures the local Auth URLs. The
   command shows the complete hosted configuration diff before applying it;
   review that diff so unrelated dashboard settings are not overwritten.

5. Preview and apply the versioned schema:

   ```bash
   npx supabase db push --dry-run
   npx supabase db push
   ```

   If CLI linking is unavailable, apply the migration files in filename order in
   the SQL editor. Do not skip
   `202607310001_retention_social_progression.sql`.

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
SUPABASE_SECRET_KEY=YOUR_MODERN_SB_SECRET_KEY
```

Restart `npm run dev` after changing environment variables.

## 3. URL settings

In **Authentication → URL Configuration**:

- Set **Site URL** to `http://localhost:3000` while testing locally.
- Add `http://localhost:3000/**` as a redirect URL if the dashboard requires it.
- Later add `https://YOUR-VERCEL-PROJECT.vercel.app/**`.

## 4. Google sign-in and anonymous account linking

The application code and PKCE callback are included, and
`enable_manual_linking = true` is tracked in `supabase/config.toml`. A Google
OAuth client still belongs to the project owner:

1. In Google Auth Platform, create a Web application OAuth client.
2. Add the app origins (`http://localhost:3000` and the production URL).
3. Add the Supabase callback URL shown in **Authentication → Providers → Google**.
4. Paste the Google Client ID and Client Secret into that provider page and
   enable Google.
5. Keep `/auth/callback` URLs in Supabase’s redirect allow list.

Do not commit the Google Client Secret. Existing anonymous players use
`linkIdentity`, which preserves their profile ID, rating, and history. Signed-out
players use a normal Google OAuth sign-in.

## 5. Verify

1. Press Play. In **Authentication → Users**, confirm an anonymous user exists.
2. In **Table Editor**, confirm its profile exists with rating 1000.
3. Confirm RLS is enabled on `profiles`, `matchmaking_queue`, `matches`, and
   `match_players`.
4. Confirm `matches` and `match_players` are in the `supabase_realtime`
   publication and that the two match-participant policies exist on
   `realtime.messages`.
5. Open the site normally and in an incognito window. Press Play in both.
6. Confirm both sessions receive the same match ID and challenge.
7. Submit both answers and confirm one completed match, two result rows, and one
   rating application.

Use `supabase/tests/verification.sql` for the duplicate, authorization, expiry,
and reconnect cases, then run the pgTAP contract in
`supabase/tests/retention_verification.sql`.

Bootstrap the first database-backed admin only if the deployment needs the
restricted admin screen. Follow `docs/admin.md`; do not use a public environment
variable or commit a user UUID. Anonymous sign-ins must remain enabled for
unranked entry, and Google linking must upgrade the current identity.
