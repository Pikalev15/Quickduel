# Testing

## Local checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Unit tests cover all twelve deterministic generators, bot payload validation,
scoring, accuracy-before-speed fairness, the 8-second Memory Grid window, seed
variance, tie handling, Elo symmetry, payload validation, and division
boundaries.

Playwright runs fixture-backed product flows at desktop and Pixel 7 viewports.
The real two-context Supabase suite is deliberately opt-in:

```bash
E2E_LIVE_SUPABASE=1 npm run test:e2e:live
```

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
9. Create a private best-of-3, join from the other context, and finish the series.
10. Check participant and unrelated-account history/detail authorization.
11. Exercise friend request, acceptance, block, and invitation expiry.
12. Check light/dark/system, deletion confirmation, and admin/non-admin states.

## Connected verification

Follow `docs/setup-supabase.md`, then use two isolated browser contexts:

- normal + incognito, or
- two different browser profiles/devices.

Verify concurrency and authorization with the checklist in
`supabase/tests/verification.sql` and
`supabase/tests/retention_verification.sql`. A disposable Supabase project is
strongly recommended for destructive database testing.

After migrations:

```bash
npx supabase db push --dry-run
npx supabase db lint --linked --level warning
```

For Google, test both flows: signed-out OAuth creates a permanent player, and an
anonymous player’s **Protect progress with Google** action keeps the same
profile ID/rating after returning through `/auth/callback`.

`supabase/tests/ranked_integrity_verification.sql` covers the ruleset boundary,
grants, RLS, row locking, `SKIP LOCKED`, one-player timeout Elo, double-timeout
no-Elo, pre-start cancellation, and retry idempotency. Run it only against a
disposable fully migrated database.

Run the live exploit case with:

```bash
E2E_LIVE_SUPABASE=1 npm run test:e2e:live
```

Manual verification requires two desktop contexts and a mobile viewport. Cover
normal ranked completion, one missing submission, double timeout, pre-start
departure, reconnect inside grace, ranked/unranked private series, history
reason, provisional permanent/season boards, match chat send/Realtime fallback/
mute/report/block, admin review, and at least one round in all twelve games.
