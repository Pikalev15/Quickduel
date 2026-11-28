begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'recovery-a@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'recovery-b@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, display_name, rating)
values
  ('00000000-0000-4000-8000-000000000301', 'RecoveryA', 1000),
  ('00000000-0000-4000-8000-000000000302', 'RecoveryB', 1000)
on conflict (id) do update set rating = 1000;

do $recovery$
begin
  -- A timeout receipt plus one valid answer must remain a timeout forfeit.
  insert into public.matches (
    id, challenge_seed, game_type, game_version, status, starts_at, committed_at,
    expires_at, reveal_duration_ms, answer_duration_ms, ruleset_version, ranked
  ) values (
    '00000000-0000-4000-8000-000000000401', 401, 'memory_grid', 1, 'active',
    now() - interval '3 seconds', now() - interval '6 seconds',
    now() + interval '4 seconds', 1000, 1000, 2, true
  );
  insert into public.match_players (match_id, user_id, ready_at, rating_before)
  select
    '00000000-0000-4000-8000-000000000401', id, now() - interval '23 seconds', 1000
  from public.profiles
  where id in (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302'
  );

  perform public.submit_game_result(
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000301',
    '{"timedOut":true}'::jsonb,
    '{"rankScore":-999999,"accuracy":0,"summary":"No answer","details":{"timedOut":true}}'::jsonb,
    (-999999)::numeric, (0)::smallint, (0)::smallint
  );
  if exists (
    select 1 from public.match_players
    where match_id = '00000000-0000-4000-8000-000000000401'
      and user_id = '00000000-0000-4000-8000-000000000301'
      and submitted_at is not null
  ) then
    raise exception 'Timeout receipt was stored as a scored submission';
  end if;

  perform public.submit_game_result(
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000302',
    '{"selectedCells":[0]}'::jsonb,
    '{"rankScore":1,"accuracy":1,"summary":"1/6 cells","details":{"correct":1,"incorrect":0,"missed":5}}'::jsonb,
    (1)::numeric, (1)::smallint, (0)::smallint
  );
  update public.matches
  set starts_at = now() - interval '20 seconds', committed_at = now() - interval '23 seconds'
  where id = '00000000-0000-4000-8000-000000000401';
  perform public.finalize_match_outcome_locked('00000000-0000-4000-8000-000000000401', true);
  if not exists (
    select 1 from public.matches
    where id = '00000000-0000-4000-8000-000000000401'
      and completion_reason = 'timeout_forfeit'
      and winner_id = '00000000-0000-4000-8000-000000000302'
  ) then
    raise exception 'Timeout receipt defeated timeout-forfeit classification';
  end if;

  -- Two timeout receipts must remain a double timeout with no scored submissions.
  insert into public.matches (
    id, challenge_seed, game_type, game_version, status, starts_at, committed_at,
    expires_at, reveal_duration_ms, answer_duration_ms, ruleset_version, ranked
  ) values (
    '00000000-0000-4000-8000-000000000402', 402, 'memory_grid', 1, 'active',
    now() - interval '20 seconds', now() - interval '23 seconds',
    now() - interval '1 second', 1000, 1000, 2, true
  );
  insert into public.match_players (match_id, user_id, ready_at, rating_before)
  select
    '00000000-0000-4000-8000-000000000402', id, now() - interval '23 seconds', 1000
  from public.profiles
  where id in (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302'
  );

  perform public.submit_game_result(
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000301',
    '{"timedOut":true}'::jsonb,
    '{"rankScore":-999999,"accuracy":0,"summary":"No answer","details":{"timedOut":true}}'::jsonb,
    (-999999)::numeric, (0)::smallint, (0)::smallint
  );
  perform public.submit_game_result(
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000302',
    '{"timedOut":true}'::jsonb,
    '{"rankScore":-999999,"accuracy":0,"summary":"No answer","details":{"timedOut":true}}'::jsonb,
    (-999999)::numeric, (0)::smallint, (0)::smallint
  );
  perform public.finalize_match_outcome_locked('00000000-0000-4000-8000-000000000402', true);
  if not exists (
    select 1 from public.matches
    where id = '00000000-0000-4000-8000-000000000402'
      and completion_reason = 'double_timeout'
      and winner_id is null
  ) then
    raise exception 'Two timeout receipts did not produce a double timeout';
  end if;
  if exists (
    select 1 from public.match_players
    where match_id = '00000000-0000-4000-8000-000000000402'
      and submitted_at is not null
  ) then
    raise exception 'Double timeout stored a scored submission';
  end if;

  -- Identical retries succeed even after completion; conflicting retries fail.
  insert into public.matches (
    id, challenge_seed, game_type, game_version, status, starts_at, committed_at,
    expires_at, reveal_duration_ms, answer_duration_ms, ruleset_version, ranked
  ) values (
    '00000000-0000-4000-8000-000000000403', 403, 'memory_grid', 1, 'active',
    now() - interval '3 seconds', now() - interval '6 seconds',
    now() + interval '4 seconds', 1000, 1000, 2, true
  );
  insert into public.match_players (match_id, user_id, ready_at, rating_before)
  select
    '00000000-0000-4000-8000-000000000403', id, now() - interval '23 seconds', 1000
  from public.profiles
  where id in (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302'
  );

  perform public.submit_game_result(
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000301',
    '{"selectedCells":[0]}'::jsonb,
    '{"rankScore":1,"accuracy":1,"summary":"1/6 cells","details":{"correct":1,"incorrect":0,"missed":5}}'::jsonb,
    (1)::numeric, (1)::smallint, (0)::smallint
  );
  perform public.submit_game_result(
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000302',
    '{"selectedCells":[1]}'::jsonb,
    '{"rankScore":0,"accuracy":0,"summary":"0/6 cells","details":{"correct":0,"incorrect":1,"missed":6}}'::jsonb,
    (0)::numeric, (0)::smallint, (1)::smallint
  );
  perform public.submit_game_result(
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000301',
    '{"selectedCells":[0]}'::jsonb,
    '{"rankScore":1,"accuracy":1,"summary":"1/6 cells","details":{"correct":1,"incorrect":0,"missed":5}}'::jsonb,
    (1)::numeric, (1)::smallint, (0)::smallint
  );

  begin
    perform public.submit_game_result(
      '00000000-0000-4000-8000-000000000403',
      '00000000-0000-4000-8000-000000000301',
      '{"selectedCells":[1]}'::jsonb,
      '{"rankScore":0,"accuracy":0,"summary":"0/6 cells","details":{"correct":0,"incorrect":1,"missed":6}}'::jsonb,
      (0)::numeric, (0)::smallint, (1)::smallint
    );
    raise exception 'Conflicting duplicate was accepted';
  exception when others then
    if sqlerrm not like '%Answer already submitted%' then
      raise;
    end if;
  end;

  -- An expired RPC fails explicitly and does not store an answer.
  insert into public.matches (
    id, challenge_seed, game_type, game_version, status, starts_at, committed_at,
    expires_at, reveal_duration_ms, answer_duration_ms, ruleset_version, ranked
  ) values (
    '00000000-0000-4000-8000-000000000404', 404, 'memory_grid', 1, 'active',
    now() - interval '20 seconds', now() - interval '23 seconds',
    now() - interval '1 second', 1000, 1000, 2, true
  );
  insert into public.match_players (match_id, user_id, ready_at, rating_before)
  select
    '00000000-0000-4000-8000-000000000404', id, now() - interval '23 seconds', 1000
  from public.profiles
  where id in (
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000302'
  );

  begin
    perform public.submit_game_result(
      '00000000-0000-4000-8000-000000000404',
      '00000000-0000-4000-8000-000000000301',
      '{"selectedCells":[0]}'::jsonb,
      '{"rankScore":1,"accuracy":1,"summary":"1/6 cells","details":{"correct":1,"incorrect":0,"missed":5}}'::jsonb,
      (1)::numeric, (1)::smallint, (0)::smallint
    );
    raise exception 'Expired submission was accepted';
  exception when others then
    if sqlerrm not like '%answer window has closed%' then
      raise;
    end if;
  end;

  if exists (
    select 1 from public.match_players
    where match_id = '00000000-0000-4000-8000-000000000404'
      and submitted_at is not null
  ) then
    raise exception 'Expired submission was stored';
  end if;

  if public.game_answer_duration('frequency_recall_v2') <> 71000 then
    raise exception 'Frequency Recall match budget does not fit five complete rounds';
  end if;
end;
$recovery$;

rollback;
