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

commit;
