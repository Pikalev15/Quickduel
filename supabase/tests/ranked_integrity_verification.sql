begin;

select plan(32);

select has_column('public', 'matches', 'ruleset_version', 'matches have a ruleset boundary');
select has_column('public', 'matches', 'committed_at', 'matches record server commitment');
select has_column('public', 'matches', 'completion_reason', 'matches record completion reason');
select has_table('public', 'integrity_runtime', 'sweeper health is recorded');
select has_table('public', 'network_rate_limit_buckets', 'network limiter table exists');
select has_table('public', 'match_chat_messages', 'match chat table exists');
select has_table('public', 'match_chat_reports', 'match chat report table exists');
select col_is_fk('public', 'match_chat_messages', 'match_id', 'chat belongs to a match');
select col_is_fk('public', 'match_chat_messages', 'sender_id', 'chat sender is a profile');

select function_returns(
  'public', 'finalize_expired_match', array['uuid'], 'text',
  'single-match expiry finalizer is exposed narrowly'
);
select function_returns(
  'public', 'finalize_expired_matches', array['integer'], 'jsonb',
  'batch expiry finalizer is available to the scheduler'
);
select function_returns(
  'public', 'check_network_rate_limit',
  array['text', 'text', 'integer', 'integer'], 'jsonb',
  'network limits accept only a server-created digest'
);
select function_returns(
  'public', 'send_match_chat_message', array['uuid', 'text'], 'jsonb',
  'chat writes use a validating RPC'
);
select function_returns(
  'public', 'get_my_rank_eligibility', array[]::text[], 'jsonb',
  'provisional eligibility has a participant RPC'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.finalize_match_outcome_locked(uuid,boolean)', 'EXECUTE'
  ),
  'clients cannot call the internal outcome finalizer'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.finalize_expired_matches(integer)', 'EXECUTE'
  ),
  'clients cannot invoke the batch scheduler'
);
select ok(
  not has_function_privilege(
    'authenticated', 'public.check_network_rate_limit(text,text,integer,integer)', 'EXECUTE'
  ),
  'clients cannot choose their own network digest'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.send_match_chat_message(uuid,text)', 'EXECUTE'
  ),
  'authenticated participants can call the chat RPC'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.match_chat_messages'::regclass),
  'chat messages have RLS'
);
select ok(
  position(
    'for update' in lower(pg_get_functiondef(
      'public.finalize_match_outcome_locked(uuid,boolean)'::regprocedure
    ))
  ) > 0,
  'outcome finalization locks the match row'
);
select ok(
  position(
    'skip locked' in lower(pg_get_functiondef(
      'public.finalize_expired_matches(integer)'::regprocedure
    ))
  ) > 0,
  'batch finalization skips rows held by another worker'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'integrity-a@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'integrity-b@example.test', '',
    now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  )
on conflict (id) do nothing;

insert into public.profiles (id, display_name, rating)
values
  ('00000000-0000-4000-8000-000000000101', 'IntegrityA', 1000),
  ('00000000-0000-4000-8000-000000000102', 'IntegrityB', 1000)
on conflict (id) do update set rating = 1000;

insert into public.matches (
  id, challenge_seed, status, starts_at, committed_at, expires_at,
  ruleset_version, ranked
) values (
  '00000000-0000-4000-8000-000000000201',
  201,
  'active',
  now() - interval '30 seconds',
  now() - interval '33 seconds',
  now() - interval '5 seconds',
  2,
  true
);
insert into public.match_players (
  match_id, user_id, ready_at, submitted_at, selected_cells,
  calculated_score, correct_count, incorrect_count, completion_time_ms,
  rating_before, submission_json, result_json
) values
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    now() - interval '33 seconds',
    now() - interval '15 seconds',
    '{}'::smallint[],
    100, 1, 0, 1000, 1000,
    '{"answer":1}',
    '{"rankScore":100,"accuracy":1,"summary":"Complete","details":{"correct":1}}'
  ),
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000102',
    now() - interval '33 seconds',
    null, null, null, null, null, null, 1000, null, null
  );

select is(
  public.finalize_match_outcome_locked(
    '00000000-0000-4000-8000-000000000201', true
  ),
  'timeout_forfeit',
  'one missing submission becomes a timeout forfeit'
);
select is(
  (select completion_reason from public.matches
    where id = '00000000-0000-4000-8000-000000000201'),
  'timeout_forfeit',
  'timeout reason is persisted'
);
select is(
  (select winner_id from public.matches
    where id = '00000000-0000-4000-8000-000000000201'),
  '00000000-0000-4000-8000-000000000101'::uuid,
  'the submitting player wins the forfeit'
);
select ok(
  (select rating from public.profiles
    where id = '00000000-0000-4000-8000-000000000101') > 1000
  and
  (select rating from public.profiles
    where id = '00000000-0000-4000-8000-000000000102') < 1000,
  'ranked timeout applies Elo to both players'
);

create temporary table integrity_rating_snapshot as
select id, rating, matches_played from public.profiles
where id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);

select is(
  public.finalize_match_outcome_locked(
    '00000000-0000-4000-8000-000000000201', true
  ),
  'timeout_forfeit',
  'retry returns the original terminal reason'
);
select ok(
  not exists (
    select 1
    from public.profiles p
    join integrity_rating_snapshot s on s.id = p.id
    where p.rating <> s.rating or p.matches_played <> s.matches_played
  ),
  'retry does not award Elo or match counts twice'
);

insert into public.matches (
  id, challenge_seed, status, starts_at, committed_at, expires_at,
  ruleset_version, ranked
) values (
  '00000000-0000-4000-8000-000000000202',
  202, 'active', now() - interval '30 seconds',
  now() - interval '33 seconds', now() - interval '5 seconds', 2, true
);
insert into public.match_players (match_id, user_id, ready_at, rating_before)
select
  '00000000-0000-4000-8000-000000000202',
  p.id,
  now() - interval '33 seconds',
  p.rating
from public.profiles p
where p.id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);

select is(
  public.finalize_match_outcome_locked(
    '00000000-0000-4000-8000-000000000202', true
  ),
  'double_timeout',
  'two missing submissions become a double timeout'
);
select ok(
  not exists (
    select 1
    from public.profiles p
    join integrity_rating_snapshot s on s.id = p.id
    where p.rating <> s.rating or p.matches_played <> s.matches_played
  ),
  'double timeout changes neither Elo nor ranked match counts'
);
select is(
  (select winner_id from public.matches
    where id = '00000000-0000-4000-8000-000000000202'),
  null::uuid,
  'double timeout has no winner'
);

insert into public.matches (
  id, challenge_seed, status, starts_at, committed_at, expires_at,
  ruleset_version, ranked
) values (
  '00000000-0000-4000-8000-000000000203',
  203, 'waiting', null, null, now() - interval '5 seconds', 2, true
);
insert into public.match_players (match_id, user_id, rating_before)
select '00000000-0000-4000-8000-000000000203', p.id, p.rating
from public.profiles p
where p.id in (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000102'
);
select is(
  public.finalize_match_outcome_locked(
    '00000000-0000-4000-8000-000000000203', true
  ),
  'cancelled_before_start',
  'an uncommitted expiry is cancelled without a forfeit'
);
select is(
  (select status::text from public.matches
    where id = '00000000-0000-4000-8000-000000000203'),
  'cancelled',
  'pre-start cancellation is terminal but not completed'
);

select * from finish();
rollback;
