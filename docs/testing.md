# Testing

## Local checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Unit tests cover all twelve deterministic generators, bot payload validation,
scoring, accuracy-before-speed fairness, the 8-second Memory Grid window, seed
variance, tie handling, Elo symmetry, and payload validation.

## Browser checks

Practice mode requires no Supabase credentials. The connected suite also checks
the live Supabase project:

1. Start `npm run dev`.
2. Open `http://localhost:3000`.
3. Confirm three suggested games are visible and the other nine expand from
   **All games**.
4. Use Interface settings to persist the full library, leaderboard preview, and
   how-it-works sections.
5. Choose Practice on each game row and verify countdown/observe/answer, game
   input, submit, result, share, and rematch.
6. Repeat at 390×844 and at a desktop viewport; verify no horizontal overflow.
7. Use two isolated browser contexts and confirm both arrive at the same live
   match ID and receive the ranked game state.
8. Enable reduced motion in the operating system and confirm pulses/transitions
   collapse.

## Connected verification

Follow `docs/setup-supabase.md`, then use two isolated browser contexts:

- normal + incognito, or
- two different browser profiles/devices.

Verify concurrency and authorization with the checklist in
`supabase/tests/verification.sql`. A disposable Supabase project is strongly
recommended for destructive database testing.

After migrations:

```bash
npx supabase db push --dry-run
npx supabase db lint --linked --level warning
```

For Google, test both flows: signed-out OAuth creates a permanent player, and an
anonymous player’s **Protect progress with Google** action keeps the same
profile ID/rating after returning through `/auth/callback`.
