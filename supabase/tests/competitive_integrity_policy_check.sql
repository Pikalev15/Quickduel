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

rollback;
