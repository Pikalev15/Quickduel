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

create table public.queue_duel_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  payload jsonb not null,
  expires_at timestamptz not null default (clock_timestamp() + interval '30 seconds')
);
alter table public.queue_duel_tickets enable row level security;
revoke all on public.queue_duel_tickets from public, anon, authenticated, service_role;
create index queue_duel_ticket_expiry on public.queue_duel_tickets(expires_at);

create or replace function public.issue_queue_duel_ticket(
  requested_user_id uuid, requested_action text, requested_payload jsonb
)
returns uuid language plpgsql security definer set search_path = ''
as $issue$
declare
  ticket_id uuid;
begin
  if requested_user_id is null or not exists (
    select 1 from auth.users u where u.id = requested_user_id
  ) then raise exception using errcode='P0001', message='QD_UNAUTHENTICATED'; end if;
  if requested_action is null or requested_action not in (
    'join_matchmaking','heartbeat_matchmaking','create_private_duel',
    'create_private_duel_workshop','join_private_duel','send_duel_invitation','respond_duel_invitation'
  ) or jsonb_typeof(requested_payload) is distinct from 'object'
     or pg_column_size(requested_payload) > 16384 then
    raise exception 'Invalid action payload';
  end if;
  delete from public.queue_duel_tickets where id in (
    select id from public.queue_duel_tickets where expires_at <= clock_timestamp()
    order by expires_at limit 100 for update skip locked
  );
  insert into public.queue_duel_tickets(user_id, action, payload)
  values (requested_user_id, requested_action, requested_payload) returning id into ticket_id;
  return ticket_id;
end;
$issue$;
revoke all on function public.issue_queue_duel_ticket(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.issue_queue_duel_ticket(uuid,text,jsonb) to service_role;

create or replace function public.server_queue_or_duel(requested_ticket uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $redeem$
declare
  caller_id uuid := auth.uid();
  requested_action text;
  requested_payload jsonb;
begin
  if caller_id is null then
    raise exception using errcode='P0001', message='QD_UNAUTHENTICATED';
  end if;
  delete from public.queue_duel_tickets t
  where t.id = requested_ticket and t.user_id = caller_id and t.expires_at > clock_timestamp()
  returning t.action, t.payload into requested_action, requested_payload;
  if not found then raise exception using errcode='P0001', message='QD_FORBIDDEN'; end if;
  if exists (
    select 1 from public.profiles p where p.id = caller_id and p.deleted_at is not null
  ) or exists (
    select 1 from public.account_enforcement e where e.user_id = caller_id
    and e.state in ('temporarily_suspended','manually_banned')
    and (e.expires_at is null or e.expires_at > now())
  ) then raise exception using errcode='P0001', message='QD_FORBIDDEN'; end if;

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
$redeem$;

revoke all on function public.server_queue_or_duel(uuid) from public, anon, authenticated, service_role;
grant execute on function public.server_queue_or_duel(uuid) to authenticated;

revoke all on function public.join_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.heartbeat_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.create_private_duel(text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.create_private_duel_workshop(text, text, text, smallint, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.join_private_duel(text) from public, anon, authenticated;
revoke all on function public.send_duel_invitation(text, text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.respond_duel_invitation(uuid, boolean) from public, anon, authenticated;

commit;
