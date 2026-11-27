-- Apply to an isolated database after the existing pending migrations.
begin;

create or replace function public.check_rate_limit(
  requested_action text,
  requested_limit integer,
  requested_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  bucket_start timestamptz;
  current_count integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;

  if not exists (
    select 1 from (values
      ('queue_write', 120, 60),
      ('profile_update', 6, 3600),
      ('private_duel_create', 8, 3600),
      ('private_duel_join', 20, 3600),
      ('share_card', 30, 3600),
      ('friend_search', 30, 600),
      ('friend_request', 12, 3600),
      ('duel_invitation', 10, 3600),
      ('match_chat', 8, 60),
      ('chat_report', 6, 3600),
      ('daily_duel', 20, 60),
      ('match_submission', 30, 60),
      ('skill_rewards', 10, 60)
    ) as policy(action, max_requests, window_seconds)
    where policy.action = requested_action
      and policy.max_requests = requested_limit
      and policy.window_seconds = requested_window_seconds
  ) then
    raise exception 'Invalid rate limit';
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / requested_window_seconds)
    * requested_window_seconds
  );

  insert into public.rate_limit_buckets (actor_id, action, window_started_at, request_count)
  values (caller_id, requested_action, bucket_start, 1)
  on conflict (actor_id, action, window_started_at)
  do update set request_count = public.rate_limit_buckets.request_count + 1
  returning request_count into current_count;

  if current_count > requested_limit then raise exception 'Rate limit exceeded'; end if;
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;

create or replace function public.server_queue_or_duel(
  requested_user_id uuid,
  requested_action text,
  requested_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set "request.jwt.claim.sub" = ''
set "request.jwt.claim.role" = ''
set "request.jwt.claim" = '{}'
set "request.jwt.claims" = '{}'
as $
declare
  anonymous_user boolean;
  claims jsonb;
begin
  select u.is_anonymous into anonymous_user
  from auth.users u where u.id = requested_user_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'QD_UNAUTHENTICATED';
  end if;
  if exists (
    select 1 from public.profiles p
    where p.id = requested_user_id and p.deleted_at is not null
  ) or exists (
    select 1 from public.account_enforcement e
    where e.user_id = requested_user_id
      and e.state in ('temporarily_suspended', 'manually_banned')
      and (e.expires_at is null or e.expires_at > now())
  ) then
    raise exception using errcode = 'P0001', message = 'QD_FORBIDDEN';
  end if;
  if jsonb_typeof(requested_payload) is distinct from 'object' then
    raise exception 'Invalid action payload';
  end if;

  claims := jsonb_build_object(
    'sub', requested_user_id, 'role', 'authenticated',
    'is_anonymous', coalesce(anonymous_user, false)
  );
  perform set_config('request.jwt.claim.sub', requested_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim', claims::text, true);
  perform set_config('request.jwt.claims', claims::text, true);

  case requested_action
    when 'join_matchmaking' then
      return public.join_matchmaking(
        requested_payload->>'requested_playlist', requested_payload->>'requested_game'
      );
    when 'heartbeat_matchmaking' then
      return public.heartbeat_matchmaking(
        requested_payload->>'requested_playlist', requested_payload->>'requested_game'
      );
    when 'create_private_duel' then
      return public.create_private_duel(
        requested_payload->>'requested_selection_kind', requested_payload->>'requested_game',
        requested_payload->>'requested_playlist', (requested_payload->>'requested_best_of')::smallint,
        (requested_payload->>'requested_ranked')::boolean
      );
    when 'create_private_duel_workshop' then
      return public.create_private_duel_workshop(
        requested_payload->>'requested_selection_kind', requested_payload->>'requested_game',
        requested_payload->>'requested_playlist', (requested_payload->>'requested_best_of')::smallint,
        (requested_payload->>'requested_ranked')::boolean, requested_payload->'requested_rules'
      );
    when 'join_private_duel' then
      return public.join_private_duel(requested_payload->>'requested_code');
    when 'send_duel_invitation' then
      return public.send_duel_invitation(
        requested_payload->>'requested_public_code',
        requested_payload->>'requested_selection_kind', requested_payload->>'requested_game',
        requested_payload->>'requested_playlist', (requested_payload->>'requested_best_of')::smallint,
        (requested_payload->>'requested_ranked')::boolean
      );
    when 'respond_duel_invitation' then
      return public.respond_duel_invitation(
        (requested_payload->>'requested_invitation_id')::uuid,
        (requested_payload->>'requested_accept')::boolean
      );
    else
      raise exception 'Invalid server action';
  end case;
end;
$;

revoke all on function public.server_queue_or_duel(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.server_queue_or_duel(uuid, text, jsonb) to service_role;

revoke all on function public.join_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.heartbeat_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.create_private_duel(text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.create_private_duel_workshop(text, text, text, smallint, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.join_private_duel(text) from public, anon, authenticated;
revoke all on function public.send_duel_invitation(text, text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.respond_duel_invitation(uuid, boolean) from public, anon, authenticated;

commit;
