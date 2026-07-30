# Testing

## Local checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Unit tests cover deterministic challenges, seed variance, scoring and incorrect
selection penalties, tie handling, Elo outcomes and symmetry, payload
validation, and deterministic Practice Bot behavior.

## Browser checks

Practice mode requires no Supabase credentials:

1. Start `npm run dev`.
2. Open `http://localhost:3000`.
3. Press `PLAY NOW`, then choose `PLAY PRACTICE` in the configuration message.
4. Verify countdown, reveal, mouse/touch selection, arrow-key movement,
   Space/Enter toggle, submit, result, share fallback, and rematch.
5. Repeat at 390×844 and at a desktop viewport.
6. Enable reduced motion in the operating system and confirm pulses/transitions
   collapse.

## Connected verification

Follow `docs/setup-supabase.md`, then use two isolated browser contexts:

- normal + incognito, or
- two different browser profiles/devices.

Verify concurrency and authorization with the checklist in
`supabase/tests/verification.sql`. A disposable Supabase project is strongly
recommended for destructive database testing.
