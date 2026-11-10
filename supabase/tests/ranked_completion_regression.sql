-- Standalone regression: no pgTap extension required. All fixtures roll back.
begin;
do $$
declare
  first_id uuid := gen_random_uuid();
  second_id uuid := gen_random_uuid();
  duel_id uuid;
  active_season text;
  iteration integer;
  reason text;
begin
  insert into auth.users (id, aud, role, raw_app_meta_data, raw_user_meta_data)
  values (first_id, 'authenticated', 'authenticated', '{}', '{}'),
    (second_id, 'authenticated', 'authenticated', '{}', '{}');
  insert into public.profiles (id, display_name, rating)
  values (first_id, 'RegressionA', 1000), (second_id, 'RegressionB', 1000)
  on conflict (id) do nothing;

  for iteration in 1..4 loop
    duel_id := gen_random_uuid();
    insert into public.matches (
      id, challenge_seed, status, starts_at, committed_at, expires_at,
      ruleset_version, ranked
    ) values (
      duel_id, iteration, 'active', now() - interval '3 seconds',
      now() - interval '6 seconds', now() + interval '1 minute', 2, true
    );
    insert into public.match_players (
      match_id, user_id, ready_at, submitted_at, selected_cells,
      calculated_score, correct_count, incorrect_count, completion_time_ms,
      rating_before, submission_json, result_json
    ) values
      (duel_id, first_id, now(), now(), '{}', 100, 1, 0, 1000,
        1000, '{"answer":1}', '{"accuracy":0.5}'),
      (duel_id, second_id, now(), now(), '{}', 50, 0, 1, 1500,
        1000, '{"answer":2}', '{"accuracy":0.25}');
    reason := public.finalize_match_outcome_locked(duel_id, false);
    if reason <> 'normal' or not exists (
      select 1 from public.matches where id = duel_id
        and status = 'completed' and winner_id = first_id
    ) then raise exception 'Normal ranked completion failed'; end if;
    -- A retry must not duplicate points, pair counts, ratings, or progression.
    perform public.finalize_match_outcome_locked(duel_id, false);
  end loop;
  active_season := public.current_season_id();
  if (select matches_counted from public.season_pair_daily_counts
    where season_id = active_season and player_low = least(first_id, second_id)
      and player_high = greatest(first_id, second_id)
      and match_day = (now() at time zone 'UTC')::date) is distinct from 3
  then raise exception 'Pair counting cap or idempotency failed'; end if;
  if not exists (
    select 1 from public.season_player_stats where season_id = active_season
      and user_id = first_id and matches_counted = 3 and points = 9 and wins = 3
  ) or not exists (
    select 1 from public.season_player_stats where season_id = active_season
      and user_id = second_id and matches_counted = 3 and points = 0 and losses = 3
  ) then raise exception 'Season insert/update points failed'; end if;
  if (select matches_played from public.profiles where id = first_id) <> 4
  then raise exception 'Completion retry duplicated match counts'; end if;
end;
$$;
rollback;
