begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'share-a@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'share-b@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, display_name, rating)
values
  ('00000000-0000-4000-8000-000000000501', 'ShareA', 1000),
  ('00000000-0000-4000-8000-000000000502', 'ShareB', 1000)
on conflict (id) do update set rating = 1000;

insert into public.matches (
  id, challenge_seed, game_type, game_version, status, ranked, winner_id,
  completed_at, share_code, share_enabled, expires_at
) values (
  '00000000-0000-4000-8000-000000000601',
  601, 'frequency_recall_v2', 2, 'completed', true,
  '00000000-0000-4000-8000-000000000501',
  now(), 'PRIVACY12345', true, now() + interval '1 day'
);

insert into public.match_players (
  match_id, user_id, ready_at, submitted_at, rating_before, rating_after,
  rating_delta, submission_json, result_json
) values
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000501',
    now(), now(), 1000, 1016, 16,
    '{"guessesHz":[440,660,880,1000,1200]}'::jsonb,
    '{"rankScore":42,"accuracy":0.84,"summary":"42/50","details":{"totalScore":42,"closestRound":2,"averageError":18,"round1Score":8,"round1Answered":true,"round1Target":440,"round1Guess":445,"round1Error":20,"round2Target":660,"round2Guess":660}}'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000601',
    '00000000-0000-4000-8000-000000000502',
    now(), now(), 1000, 984, -16,
    '{"guessesHz":[430,650,870,990,1190]}'::jsonb,
    '{"rankScore":39,"accuracy":0.78,"summary":"39/50","details":{"totalScore":39,"closestRound":1,"averageError":22,"round1Score":9,"round1Answered":true,"round1Target":440,"round1Guess":430}}'::jsonb
  );

do $projection$
declare
  payload jsonb;
  details jsonb;
  key text;
begin
  payload := public.get_public_match_share('PRIVACY12345');
  if payload is null then
    raise exception 'Public share fixture was not returned';
  end if;
  details := payload -> 'players' -> 0 -> 'details';
  if details ->> 'totalScore' is null or details ->> 'round1Score' is null then
    raise exception 'Public share lost approved aggregate metrics';
  end if;
  for key in
    select jsonb_object_keys(details)
  loop
    if key ~ '^round[1-5](Target|Guess|PercentError|Error)$' then
      raise exception 'Public share leaked private recall field: %', key;
    end if;
  end loop;
  if payload::text like '%guessesHz%' or payload::text like '%submission_json%' then
    raise exception 'Public share leaked a submission payload';
  end if;

  update public.matches
  set invalidated_at = now(), completion_reason = 'admin_invalidated', ranked = false, share_enabled = false
  where id = '00000000-0000-4000-8000-000000000601';
  if public.get_public_match_share('PRIVACY12345') is not null then
    raise exception 'Invalidated match remained publicly shareable';
  end if;
end;
$projection$;

rollback;
