begin;

alter table public.matches
  drop constraint matches_reveal_duration_ms_check,
  add constraint matches_reveal_duration_ms_check
    check (reveal_duration_ms between 0 and 10000);

commit;
