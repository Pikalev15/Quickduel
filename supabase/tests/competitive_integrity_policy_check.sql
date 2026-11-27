begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000009801',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'integrity-policy@example.test', '',
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.profiles (id, display_name, rating)
values ('00000000-0000-4000-8000-000000009801', 'PolicyTest', 1000)
on conflict (id) do nothing;

do $$
begin
  if has_function_privilege('anon', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.check_rate_limit(text,integer,integer)', 'EXECUTE') then
    raise exception 'Incorrect rate-limit function grants';
  end if;
  if has_table_privilege('authenticated', 'public.rate_limit_buckets', 'INSERT')
     or has_table_privilege('authenticated', 'public.rate_limit_buckets', 'UPDATE') then
    raise exception 'Direct bucket mutation is permitted';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000009801', true);
set local role authenticated;

do $$
declare
  policy record;
  n integer;
begin
  for policy in select * from (values
    ('queue_write',120,60), ('profile_update',6,3600),
    ('private_duel_create',8,3600), ('private_duel_join',20,3600),
    ('share_card',30,3600), ('friend_search',30,600),
    ('friend_request',12,3600), ('duel_invitation',10,3600),
    ('match_chat',8,60), ('chat_report',6,3600), ('daily_duel',20,60),
    ('match_submission',30,60), ('skill_rewards',10,60)
  ) as p(action, maximum, seconds)
  loop
    if not public.check_rate_limit(policy.action,policy.maximum,policy.seconds) then
      raise exception 'Approved policy rejected: %', policy.action;
    end if;
  end loop;

  begin
    perform public.check_rate_limit('unknown-action', 100, 60);
    raise exception 'Unknown action accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid rate limit' then raise; end if;
  end;

  begin
    perform public.check_rate_limit('profile_update', 999, 3600);
    raise exception 'Modified limit accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid rate limit' then raise; end if;
  end;

  begin
    perform public.check_rate_limit('profile_update', 6, 1);
    raise exception 'Modified window accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid rate limit' then raise; end if;
  end;

  begin
    perform public.check_rate_limit(null, null, null);
    raise exception 'Null policy accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid rate limit' then raise; end if;
  end;

  for n in 2..6 loop
    perform public.check_rate_limit('profile_update', 6, 3600);
  end loop;
  begin
    perform public.check_rate_limit('profile_update', 6, 3600);
    raise exception 'Exceeded rate accepted';
  exception when raise_exception then
    if sqlerrm <> 'Rate limit exceeded' then raise; end if;
  end;
end;
$$;

reset role;
do $$
begin
  if exists (
    select 1 from public.rate_limit_buckets
    where actor_id = '00000000-0000-4000-8000-000000009801'
    and action = 'unknown-action'
  ) then raise exception 'Invalid request created a bucket'; end if;
end;
$$;


do $
declare
  signature text;
begin
  foreach signature in array array[
    'public.server_queue_or_duel(uuid,text,jsonb)',
    'public.join_matchmaking(text,text)',
    'public.heartbeat_matchmaking(text,text)',
    'public.create_private_duel(text,text,text,smallint,boolean)',
    'public.create_private_duel_workshop(text,text,text,smallint,boolean,jsonb)',
    'public.join_private_duel(text)',
    'public.send_duel_invitation(text,text,text,text,smallint,boolean)',
    'public.respond_duel_invitation(uuid,boolean)'
  ] loop
    if has_function_privilege('authenticated', signature, 'EXECUTE')
       or has_function_privilege('anon', signature, 'EXECUTE') then
      raise exception 'Client can call protected operation: %', signature;
    end if;
  end loop;
  if not has_function_privilege('service_role','public.server_queue_or_duel(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Trusted service cannot call gateway';
  end if;
end;
$;

update auth.users set is_anonymous = true where id = '00000000-0000-4000-8000-000000009801';
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;

do $
declare
  result jsonb;
begin
  result := public.server_queue_or_duel(
    '00000000-0000-4000-8000-000000009801', 'join_matchmaking',
    '{"requested_playlist":"quick","requested_game":"memory_grid"}'
  );
  if result->>'queued' is distinct from 'true' then
    raise exception 'Valid matchmaking request did not queue: %', result;
  end if;
  if auth.uid() is not null then raise exception 'Gateway leaked caller identity'; end if;

  begin
    perform public.server_queue_or_duel(
      '00000000-0000-4000-8000-000000009801', 'create_private_duel',
      '{"requested_selection_kind":"game","requested_game":"memory_grid","requested_playlist":"quick","requested_best_of":1,"requested_ranked":true}'
    );
    raise exception 'Anonymous ranked creation accepted';
  exception when raise_exception then
    if sqlerrm <> 'Ranked private duels require a linked account' then raise; end if;
  end;

  result := public.server_queue_or_duel(
    '00000000-0000-4000-8000-000000009801', 'create_private_duel',
    '{"requested_selection_kind":"game","requested_game":"memory_grid","requested_playlist":"quick","requested_best_of":1,"requested_ranked":false}'
  );
  if result->>'code' is null then raise exception 'Unranked duel creation failed'; end if;
  if auth.uid() is not null then raise exception 'Gateway leaked caller identity'; end if;

  begin
    perform public.server_queue_or_duel('00000000-0000-4000-8000-000000009999','join_matchmaking','{}');
    raise exception 'Unknown actor accepted';
  exception when raise_exception then
    if sqlerrm <> 'QD_UNAUTHENTICATED' then raise; end if;
  end;
end;
$;

reset role;
do $
begin
  if not exists (
    select 1 from public.matchmaking_queue where user_id='00000000-0000-4000-8000-000000009801'
  ) or not exists (
    select 1 from public.private_duels where host_id='00000000-0000-4000-8000-000000009801'
  ) then raise exception 'Gateway operation was attributed to the wrong player'; end if;
end;
$;

insert into public.account_enforcement(user_id,state)
values ('00000000-0000-4000-8000-000000009801','manually_banned');

set local role service_role;
do $
begin
  begin
    perform public.server_queue_or_duel(
      '00000000-0000-4000-8000-000000009801','heartbeat_matchmaking',
      '{"requested_playlist":"quick","requested_game":"memory_grid"}'
    );
    raise exception 'Banned actor accepted';
  exception when raise_exception then
    if sqlerrm <> 'QD_FORBIDDEN' then raise; end if;
  end;
end;
$;
reset role;

rollback;
