begin;

-- Supabase Cron is the durable scheduler for timeout finalization. Keeping this
-- in the database avoids tying ranked integrity to a paid Vercel cron cadence.
create extension if not exists pg_cron;

-- New matches use ruleset 2. Existing rows remain ruleset 1 so timeout losses
-- are never applied retroactively across the deployment boundary.
alter table public.matches
  add column ruleset_version smallint not null default 1,
  add column committed_at timestamptz,
  add column completion_reason text,
  add constraint matches_ruleset_version_positive check (ruleset_version >= 1),
  add constraint matches_completion_reason_valid check (
    completion_reason is null or completion_reason in (
      'normal',
      'timeout_forfeit',
      'double_timeout',
      'cancelled_before_start',
      'admin_invalidated'
    )
  );

alter table public.matches alter column ruleset_version set default 2;

create table public.integrity_runtime (
  singleton boolean primary key default true check (singleton),
  active_ruleset_version smallint not null,
  timeout_rules_activated_at timestamptz not null,
  last_expiry_sweep_at timestamptz,
  last_expiry_sweep_count integer not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.integrity_runtime (
  singleton, active_ruleset_version, timeout_rules_activated_at
) values (true, 2, clock_timestamp());

create or replace function public.ranked_forfeit_grace_seconds()
returns integer
language sql
immutable
set search_path = ''
as $$ select 5; $$;

create or replace function public.mark_match_ready(requested_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_row public.matches;
  ready_count integer;
  official_start timestamptz;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'QD_UNAUTHENTICATED';
  end if;
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found or not public.is_match_participant(requested_match_id) then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  if match_row.status not in ('waiting', 'countdown') then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_READYABLE';
  end if;

  update public.match_players
  set ready_at = coalesce(ready_at, clock_timestamp())
  where match_id = requested_match_id and user_id = caller_id;

  select count(*) into ready_count
  from public.match_players
  where match_id = requested_match_id and ready_at is not null;

  if ready_count = 2 and match_row.starts_at is null then
    official_start := clock_timestamp() + interval '3 seconds';
    update public.matches
    set
      status = 'countdown',
      starts_at = official_start,
      committed_at = clock_timestamp(),
      expires_at = official_start
        + make_interval(secs => (
          reveal_duration_ms + answer_duration_ms
        )::double precision / 1000)
        + make_interval(secs => public.ranked_forfeit_grace_seconds())
    where id = requested_match_id;
  end if;

  return public.get_match_snapshot(requested_match_id);
end;
$$;

-- One locked outcome function is shared by normal submission completion and
-- scheduled/opportunistic expiry completion. Terminal rows are a no-op.
create or replace function public.finalize_match_outcome_locked(
  requested_match_id uuid,
  requested_expiry boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_row public.matches;
  first_player public.match_players;
  second_player public.match_players;
  winner uuid;
  reason text;
  first_actual numeric;
  second_actual numeric;
  first_expected numeric;
  first_delta integer := 0;
  second_delta integer := 0;
  first_after integer;
  second_after integer;
  deadline timestamptz;
begin
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  if match_row.status in ('completed', 'cancelled', 'abandoned') then
    return coalesce(match_row.completion_reason, 'legacy_terminal');
  end if;

  select * into first_player
  from public.match_players
  where match_id = requested_match_id
  order by user_id
  limit 1;
  select * into second_player
  from public.match_players
  where match_id = requested_match_id
  order by user_id
  offset 1 limit 1;
  if first_player.user_id is null or second_player.user_id is null then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_PLAYERS_INVALID';
  end if;

  if requested_expiry then
    if match_row.ruleset_version < 2 then
      update public.matches
      set status = 'abandoned'
      where id = requested_match_id
        and status in ('waiting', 'countdown', 'active');
      return 'legacy_abandoned';
    end if;
    deadline := case
      when match_row.starts_at is null then match_row.expires_at
      else match_row.starts_at
        + make_interval(secs => (
          match_row.reveal_duration_ms + match_row.answer_duration_ms
        )::double precision / 1000)
        + make_interval(secs => public.ranked_forfeit_grace_seconds())
    end;
    if clock_timestamp() < deadline then return 'pending'; end if;
    if match_row.starts_at is null or match_row.committed_at is null then
      update public.matches
      set
        status = 'cancelled',
        completion_reason = 'cancelled_before_start'
      where id = requested_match_id;
      return 'cancelled_before_start';
    end if;
    if first_player.submitted_at is null and second_player.submitted_at is null then
      reason := 'double_timeout';
      winner := null;
      first_actual := 0.5;
      second_actual := 0.5;
    elsif first_player.submitted_at is null then
      reason := 'timeout_forfeit';
      winner := second_player.user_id;
      first_actual := 0;
      second_actual := 1;
    elsif second_player.submitted_at is null then
      reason := 'timeout_forfeit';
      winner := first_player.user_id;
      first_actual := 1;
      second_actual := 0;
    else
      requested_expiry := false;
    end if;
  end if;

  if not requested_expiry then
    if first_player.submitted_at is null or second_player.submitted_at is null then
      return 'pending';
    end if;
    reason := 'normal';
    if first_player.calculated_score > second_player.calculated_score then
      winner := first_player.user_id; first_actual := 1; second_actual := 0;
    elsif first_player.calculated_score < second_player.calculated_score then
      winner := second_player.user_id; first_actual := 0; second_actual := 1;
    elsif abs(first_player.completion_time_ms - second_player.completion_time_ms) <= 10 then
      winner := null; first_actual := 0.5; second_actual := 0.5;
    elsif first_player.completion_time_ms < second_player.completion_time_ms then
      winner := first_player.user_id; first_actual := 1; second_actual := 0;
    else
      winner := second_player.user_id; first_actual := 0; second_actual := 1;
    end if;
  end if;

  -- Preserve a visible, validated result for a player who never submitted while
  -- leaving submitted_at null as the authoritative proof of the forfeit.
  update public.match_players
  set
    submission_json = coalesce(submission_json, '{"timedOut":true}'::jsonb),
    result_json = coalesce(result_json, jsonb_build_object(
      'rankScore', -999999,
      'accuracy', 0,
      'summary', 'No answer',
      'details', jsonb_build_object('timedOut', true)
    )),
    calculated_score = coalesce(calculated_score, -999999),
    correct_count = coalesce(correct_count, 0),
    incorrect_count = coalesce(incorrect_count, 0),
    completion_time_ms = coalesce(completion_time_ms, match_row.answer_duration_ms),
    selected_cells = coalesce(selected_cells, '{}'::smallint[])
  where match_id = requested_match_id
    and submitted_at is null;

  first_after := first_player.rating_before;
  second_after := second_player.rating_before;
  if match_row.ranked and reason <> 'double_timeout' then
    first_expected := 1 / (1 + power(
      10,
      (second_player.rating_before - first_player.rating_before)::numeric / 400
    ));
    first_delta := round(32 * (first_actual - first_expected));
    second_delta := round(32 * (second_actual - (1 - first_expected)));
    first_after := least(4000, greatest(100, first_player.rating_before + first_delta));
    second_after := least(4000, greatest(100, second_player.rating_before + second_delta));
    update public.profiles
    set
      rating = case
        when id = first_player.user_id then first_after else second_after
      end,
      wins = wins + case when id = winner then 1 else 0 end,
      losses = losses + case when winner is not null and id <> winner then 1 else 0 end,
      draws = draws + case when winner is null then 1 else 0 end,
      matches_played = matches_played + 1
    where id in (first_player.user_id, second_player.user_id);
  end if;

  update public.match_players
  set
    rating_after = case
      when user_id = first_player.user_id then first_after else second_after
    end,
    rating_delta = case
      when user_id = first_player.user_id then first_delta else second_delta
    end
  where match_id = requested_match_id;

  if reason <> 'double_timeout' then
    insert into public.game_stats (
      user_id, game_type, played, wins, losses, draws,
      best_rank_score, best_time_ms
    )
    select
      mp.user_id,
      match_row.game_type,
      1,
      case when mp.user_id = winner then 1 else 0 end,
      case when winner is not null and mp.user_id <> winner then 1 else 0 end,
      case when winner is null then 1 else 0 end,
      mp.calculated_score,
      mp.completion_time_ms
    from public.match_players mp
    where mp.match_id = requested_match_id
    on conflict (user_id, game_type) do update set
      played = public.game_stats.played + 1,
      wins = public.game_stats.wins + excluded.wins,
      losses = public.game_stats.losses + excluded.losses,
      draws = public.game_stats.draws + excluded.draws,
      best_rank_score = greatest(
        public.game_stats.best_rank_score, excluded.best_rank_score
      ),
      best_time_ms = least(public.game_stats.best_time_ms, excluded.best_time_ms),
      updated_at = now();
  end if;

  update public.matches
  set
    status = 'completed',
    winner_id = winner,
    completed_at = clock_timestamp(),
    completion_reason = reason,
    -- Double timeouts are void for ratings and season points.
    invalidated_at = case
      when reason = 'double_timeout' then clock_timestamp()
      else invalidated_at
    end
  where id = requested_match_id and status not in ('completed', 'cancelled');
  return reason;
end;
$$;

create or replace function public.finalize_match_locked(requested_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.finalize_match_outcome_locked(requested_match_id, false);
end;
$$;

create or replace function public.finalize_expired_match(requested_match_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
    and not public.is_match_participant(requested_match_id) then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  return public.finalize_match_outcome_locked(requested_match_id, true);
end;
$$;

create or replace function public.finalize_expired_matches(
  requested_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_id uuid;
  finalized integer := 0;
  result text;
begin
  for match_id in
    select m.id
    from public.matches m
    where m.status in ('waiting', 'countdown', 'active')
      and m.expires_at <= clock_timestamp()
    order by m.expires_at
    limit least(greatest(requested_limit, 1), 500)
    for update skip locked
  loop
    result := public.finalize_match_outcome_locked(match_id, true);
    if result <> 'pending' then finalized := finalized + 1; end if;
  end loop;
  update public.integrity_runtime
  set
    last_expiry_sweep_at = clock_timestamp(),
    last_expiry_sweep_count = finalized,
    updated_at = clock_timestamp()
  where singleton;
  return jsonb_build_object('finalized', finalized, 'checked_at', clock_timestamp());
end;
$$;

create or replace function public.submit_game_result(
  requested_match_id uuid,
  requested_user_id uuid,
  submitted_payload jsonb,
  calculated_result jsonb,
  calculated_rank_score numeric,
  calculated_correct smallint,
  calculated_incorrect smallint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_row public.matches;
  answer_started_at timestamptz;
  elapsed_ms integer;
begin
  if submitted_payload is null or calculated_result is null
    or pg_column_size(submitted_payload) > 16384
    or pg_column_size(calculated_result) > 16384 then
    raise exception using
      errcode = 'P0001',
      message = 'Game submission is invalid.',
      detail = 'QD_INVALID_SUBMISSION';
  end if;
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found or match_row.status in ('completed', 'abandoned', 'cancelled') then
    raise exception using
      errcode = 'P0001',
      message = 'Match is no longer active.',
      detail = 'QD_MATCH_TERMINAL';
  end if;
  if not exists (
    select 1 from public.match_players
    where match_id = requested_match_id and user_id = requested_user_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Match was not found.',
      detail = 'QD_MATCH_NOT_FOUND';
  end if;
  answer_started_at := match_row.starts_at
    + make_interval(secs => match_row.reveal_duration_ms::double precision / 1000);
  if answer_started_at is null or clock_timestamp() < answer_started_at then
    raise exception using
      errcode = 'P0001',
      message = 'Answer phase has not started.',
      detail = 'QD_ANSWER_NOT_OPEN';
  end if;
  if clock_timestamp() > answer_started_at
    + make_interval(secs => (
      match_row.answer_duration_ms
      + public.ranked_forfeit_grace_seconds() * 1000
    )::double precision / 1000) then
    perform public.finalize_match_outcome_locked(requested_match_id, true);
    return;
  end if;
  elapsed_ms := least(match_row.answer_duration_ms, greatest(
    0,
    round(extract(epoch from (clock_timestamp() - answer_started_at)) * 1000)
  ));
  update public.match_players
  set
    submitted_at = clock_timestamp(),
    submission_json = submitted_payload,
    result_json = calculated_result,
    calculated_score = calculated_rank_score,
    correct_count = calculated_correct,
    incorrect_count = calculated_incorrect,
    completion_time_ms = elapsed_ms,
    selected_cells = '{}'::smallint[]
  where match_id = requested_match_id
    and user_id = requested_user_id
    and submitted_at is null;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Answer already submitted.',
      detail = 'QD_DUPLICATE_SUBMISSION';
  end if;
  update public.matches
  set status = 'active'
  where id = requested_match_id and status = 'countdown';
  perform public.finalize_match_outcome_locked(requested_match_id, false);
end;
$$;

create or replace function public.get_match_snapshot(requested_match_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_row public.matches;
  players_json jsonb;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'QD_UNAUTHENTICATED';
  end if;
  if not public.is_match_participant(requested_match_id) then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  select * into match_row from public.matches where id = requested_match_id;
  if not found then return null; end if;
  if match_row.status in ('waiting', 'countdown', 'active')
    and match_row.expires_at <= clock_timestamp() then
    perform public.finalize_expired_match(requested_match_id);
    select * into match_row from public.matches where id = requested_match_id;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', mp.user_id,
      'display_name', p.display_name,
      'ready_at', mp.ready_at,
      'submitted_at', mp.submitted_at,
      'calculated_score', case
        when match_row.status = 'completed' or mp.user_id = caller_id
        then mp.calculated_score else null end,
      'correct_count', case
        when match_row.status = 'completed' or mp.user_id = caller_id
        then mp.correct_count else null end,
      'incorrect_count', case
        when match_row.status = 'completed' or mp.user_id = caller_id
        then mp.incorrect_count else null end,
      'completion_time_ms', case
        when match_row.status = 'completed' or mp.user_id = caller_id
        then mp.completion_time_ms else null end,
      'rating_before', mp.rating_before,
      'rating_after', mp.rating_after,
      'rating_delta', mp.rating_delta,
      'result', case
        when match_row.status = 'completed' or mp.user_id = caller_id
        then mp.result_json else null end,
      'rematch_requested_at', mp.rematch_requested_at
    ) order by mp.user_id
  ) into players_json
  from public.match_players mp
  join public.profiles p on p.id = mp.user_id
  where mp.match_id = requested_match_id;

  return jsonb_build_object(
    'id', match_row.id,
    'status', match_row.status,
    'game_type', match_row.game_type,
    'game_version', match_row.game_version,
    'ranked', match_row.ranked,
    'ruleset_version', match_row.ruleset_version,
    'completion_reason', match_row.completion_reason,
    'committed_at', match_row.committed_at,
    'reveal_duration_ms', match_row.reveal_duration_ms,
    'answer_duration_ms', match_row.answer_duration_ms,
    'starts_at', match_row.starts_at,
    'expires_at', match_row.expires_at,
    'winner_id', match_row.winner_id,
    'completed_at', match_row.completed_at,
    'rematch_match_id', match_row.rematch_match_id,
    'current_user_id', caller_id,
    'players', players_json
  );
end;
$$;

create or replace function public.get_match_history(
  requested_limit integer default 20,
  requested_before timestamptz default null,
  requested_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  result_items jsonb;
  page_size integer := least(greatest(requested_limit, 1), 50);
  next_time timestamptz;
  next_id uuid;
  has_more boolean;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'QD_UNAUTHENTICATED';
  end if;
  with history_rows as (
    select
      m.*,
      mine.result_json as my_result,
      mine.completion_time_ms as my_time,
      mine.rating_delta as my_rating_delta,
      opponent.result_json as opponent_result,
      opponent.completion_time_ms as opponent_time,
      opponent_profile.display_name as opponent_name,
      opponent_profile.public_code as opponent_code
    from public.match_players mine
    join public.matches m on m.id = mine.match_id
    join public.match_players opponent
      on opponent.match_id = mine.match_id and opponent.user_id <> mine.user_id
    join public.profiles opponent_profile on opponent_profile.id = opponent.user_id
    where mine.user_id = caller_id
      and m.status = 'completed'
      and (
        requested_before is null
        or (m.completed_at, m.id) < (requested_before, requested_before_id)
      )
    order by m.completed_at desc, m.id desc
    limit page_size + 1
  ),
  numbered as (
    select *, row_number() over (order by completed_at desc, id desc) as row_number
    from history_rows
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'outcome', case
        when winner_id is null then 'draw'
        when winner_id = caller_id then 'win'
        else 'loss'
      end,
      'opponent_name', opponent_name,
      'opponent_code', opponent_code,
      'game_type', game_type,
      'ranked', ranked,
      'rating_delta', my_rating_delta,
      'player_summary', my_result ->> 'summary',
      'opponent_summary', opponent_result ->> 'summary',
      'player_time_ms', my_time,
      'opponent_time_ms', opponent_time,
      'completed_at', completed_at,
      'completion_reason', completion_reason,
      'source', source,
      'private_duel_id', private_duel_id,
      'series_round', series_round
    ) order by completed_at desc, id desc)
      filter (where row_number <= page_size), '[]'::jsonb),
    max(completed_at) filter (where row_number = page_size),
    (max(id::text) filter (where row_number = page_size))::uuid,
    count(*) > page_size
  into result_items, next_time, next_id, has_more
  from numbered;
  return jsonb_build_object(
    'items', result_items,
    'next_cursor', case when not has_more then null else jsonb_build_object(
      'completed_at', next_time,
      'id', next_id
    ) end
  );
end;
$$;

create or replace function public.get_match_history_detail(requested_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  match_row public.matches;
  players_json jsonb;
begin
  if auth.uid() is null or not public.is_match_participant(requested_match_id) then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  select * into match_row
  from public.matches
  where id = requested_match_id and status = 'completed';
  if not found then return null; end if;
  select jsonb_agg(jsonb_build_object(
    'display_name', p.display_name,
    'is_winner', match_row.winner_id = mp.user_id,
    'submission', mp.submission_json,
    'result', mp.result_json,
    'completion_time_ms', mp.completion_time_ms,
    'rating_before', mp.rating_before,
    'rating_after', mp.rating_after,
    'rating_delta', mp.rating_delta,
    'submitted_at', mp.submitted_at
  ) order by mp.user_id)
  into players_json
  from public.match_players mp
  join public.profiles p on p.id = mp.user_id
  where mp.match_id = requested_match_id;
  return jsonb_build_object(
    'id', match_row.id,
    'game_type', match_row.game_type,
    'game_version', match_row.game_version,
    'ranked', match_row.ranked,
    'is_draw', match_row.winner_id is null,
    'completion_reason', match_row.completion_reason,
    'starts_at', match_row.starts_at,
    'completed_at', match_row.completed_at,
    'source', match_row.source,
    'private_duel_id', match_row.private_duel_id,
    'series_round', match_row.series_round,
    'players', players_json
  );
end;
$$;

create or replace function public.admin_invalidate_match(
  requested_match_id uuid,
  requested_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['admin']) then
    raise exception using errcode = 'P0001', message = 'QD_FORBIDDEN';
  end if;
  update public.matches
  set
    invalidated_at = coalesce(invalidated_at, clock_timestamp()),
    completion_reason = 'admin_invalidated',
    ranked = false
  where id = requested_match_id and status = 'completed';
  if not found then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  insert into public.audit_log (
    actor_id, action, target_match_id, reason
  ) values (
    auth.uid(), 'match_invalidated', requested_match_id, requested_reason
  );
  return jsonb_build_object('invalidated', true);
end;
$$;

-- HMAC digests are computed by the server with RATE_LIMIT_HASH_KEY. This table
-- never receives or stores a raw address.
create table public.network_rate_limit_buckets (
  network_digest text not null check (network_digest ~ '^[a-f0-9]{64}$'),
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  expires_at timestamptz not null,
  primary key (network_digest, action, window_started_at)
);
create index network_rate_limit_expiry_idx
  on public.network_rate_limit_buckets (expires_at);

create or replace function public.check_network_rate_limit(
  requested_network_digest text,
  requested_action text,
  requested_limit integer,
  requested_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket_start timestamptz;
  current_count integer;
begin
  if requested_network_digest !~ '^[a-f0-9]{64}$'
    or requested_limit < 1
    or requested_window_seconds < 1 then
    raise exception using errcode = 'P0001', message = 'QD_INVALID_RATE_LIMIT';
  end if;
  bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / requested_window_seconds)
    * requested_window_seconds
  );
  insert into public.network_rate_limit_buckets (
    network_digest, action, window_started_at, request_count, expires_at
  ) values (
    requested_network_digest,
    requested_action,
    bucket_start,
    1,
    bucket_start + make_interval(secs => requested_window_seconds * 2)
  )
  on conflict (network_digest, action, window_started_at)
  do update set request_count =
    public.network_rate_limit_buckets.request_count + 1
  returning request_count into current_count;
  return jsonb_build_object(
    'allowed', current_count <= requested_limit,
    'challenge_required', current_count > greatest(2, floor(requested_limit * 0.7)),
    'count', current_count
  );
end;
$$;

create or replace function public.is_public_rank_eligible(requested_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = requested_user_id
      and p.deleted_at is null
      and p.account_state = 'normal'
      and p.matches_played >= 5
      and exists (
        select 1
        from auth.identities i
        where i.user_id = p.id and i.provider <> 'anonymous'
      )
  );
$$;

create or replace function public.get_my_rank_eligibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  linked boolean;
  played integer;
  state text;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'QD_UNAUTHENTICATED';
  end if;
  select
    p.matches_played,
    p.account_state,
    exists (
      select 1 from auth.identities i
      where i.user_id = p.id and i.provider <> 'anonymous'
    )
  into played, state, linked
  from public.profiles p
  where p.id = auth.uid();
  return jsonb_build_object(
    'eligible', public.is_public_rank_eligible(auth.uid()),
    'linked_identity', linked,
    'ranked_matches', played,
    'ranked_matches_required', 5,
    'remaining_ranked_matches', greatest(0, 5 - played),
    'account_state', state
  );
end;
$$;

drop function if exists public.get_public_leaderboard(integer);
create function public.get_public_leaderboard(result_limit integer default 100)
returns table (
  rank bigint,
  id text,
  display_name text,
  rating integer,
  wins integer,
  losses integer,
  draws integer,
  matches_played integer,
  public_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (
      order by p.rating desc, p.wins desc, p.created_at asc
    ) as rank,
    p.public_code as id,
    p.display_name,
    p.rating,
    p.wins,
    p.losses,
    p.draws,
    p.matches_played,
    p.public_code
  from public.profiles p
  where public.is_public_rank_eligible(p.id)
  order by p.rating desc, p.wins desc, p.created_at asc
  limit least(greatest(result_limit, 1), 100);
$$;

create or replace function public.get_season_overview(
  requested_season_id text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_id text := coalesce(requested_season_id, public.current_season_id());
  season_row public.season_definitions;
  leaderboard jsonb;
  mine jsonb;
begin
  select * into season_row
  from public.season_definitions
  where id = selected_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(board) order by board.rank), '[]'::jsonb)
  into leaderboard
  from (
    select
      row_number() over (
        order by s.points desc, s.wins desc, s.updated_at asc
      ) as rank,
      p.display_name,
      p.public_code,
      p.rating,
      s.points,
      s.wins,
      s.losses,
      s.draws,
      s.matches_counted
    from public.season_player_stats s
    join public.profiles p on p.id = s.user_id
    where s.season_id = selected_id
      and public.is_public_rank_eligible(p.id)
    order by s.points desc, s.wins desc, s.updated_at asc
    limit 100
  ) board;
  if auth.uid() is not null then
    select to_jsonb(player_row) into mine
    from (
      select
        1 + (
          select count(*)
          from public.season_player_stats ahead
          join public.profiles ahead_profile on ahead_profile.id = ahead.user_id
          where ahead.season_id = selected_id
            and public.is_public_rank_eligible(ahead_profile.id)
            and (ahead.points, ahead.wins) > (s.points, s.wins)
        ) as rank,
        s.points,
        s.wins,
        s.losses,
        s.draws,
        s.matches_counted,
        public.is_public_rank_eligible(s.user_id) as publicly_eligible
      from public.season_player_stats s
      where s.season_id = selected_id and s.user_id = auth.uid()
    ) player_row;
  end if;
  return jsonb_build_object(
    'id', season_row.id,
    'starts_at', season_row.starts_at,
    'ends_at', season_row.ends_at,
    'status', case
      when now() < season_row.starts_at then 'upcoming'
      when now() >= season_row.ends_at then 'archived'
      else 'active'
    end,
    'player', mine,
    'leaderboard', leaderboard
  );
end;
$$;

-- Participant-only, short-lived 1v1 chat. It is deliberately not a DM system.
create table public.match_chat_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (
    char_length(body) between 1 and 280
    and body = btrim(body)
  ),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '7 days')
);
create index match_chat_messages_match_idx
  on public.match_chat_messages (match_id, created_at, id);
create index match_chat_messages_expiry_idx
  on public.match_chat_messages (expires_at);

create table public.match_chat_reports (
  message_id uuid not null references public.match_chat_messages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'spam', 'personal_info', 'other')),
  created_at timestamptz not null default clock_timestamp(),
  primary key (message_id, reporter_id)
);

create or replace function public.match_chat_visible(requested_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_match_participant(requested_match_id)
    and not exists (
      select 1
      from public.match_players mine
      join public.match_players opponent
        on opponent.match_id = mine.match_id
        and opponent.user_id <> mine.user_id
      join public.user_blocks b
        on (b.blocker_id = mine.user_id and b.blocked_id = opponent.user_id)
        or (b.blocker_id = opponent.user_id and b.blocked_id = mine.user_id)
      where mine.match_id = requested_match_id
        and mine.user_id = auth.uid()
    );
$$;

create or replace function public.send_match_chat_message(
  requested_match_id uuid,
  requested_body text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := btrim(requested_body);
  match_row public.matches;
  inserted public.match_chat_messages;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'QD_UNAUTHENTICATED';
  end if;
  if char_length(normalized) not between 1 and 280 then
    raise exception using errcode = 'P0001', message = 'QD_CHAT_INVALID';
  end if;
  select * into match_row from public.matches where id = requested_match_id;
  if not found or not public.match_chat_visible(requested_match_id) then
    raise exception using errcode = 'P0001', message = 'QD_CHAT_UNAVAILABLE';
  end if;
  if match_row.status not in ('waiting', 'countdown', 'active', 'completed')
    or (
      match_row.status = 'completed'
      and match_row.completed_at < clock_timestamp() - interval '10 minutes'
    ) then
    raise exception using errcode = 'P0001', message = 'QD_CHAT_CLOSED';
  end if;
  perform public.check_rate_limit('match_chat', 8, 60);
  if (
    select count(*) from public.match_chat_messages
    where match_id = requested_match_id and sender_id = auth.uid()
  ) >= 50 then
    raise exception using errcode = 'P0001', message = 'QD_CHAT_LIMIT';
  end if;
  insert into public.match_chat_messages (match_id, sender_id, body)
  values (requested_match_id, auth.uid(), normalized)
  returning * into inserted;
  return jsonb_build_object(
    'id', inserted.id,
    'sender_id', inserted.sender_id,
    'body', inserted.body,
    'created_at', inserted.created_at
  );
end;
$$;

create or replace function public.get_match_chat(
  requested_match_id uuid,
  requested_after timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  messages jsonb;
begin
  if not public.match_chat_visible(requested_match_id) then
    raise exception using errcode = 'P0001', message = 'QD_CHAT_UNAVAILABLE';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'sender_id', c.sender_id,
    'sender_name', p.display_name,
    'body', c.body,
    'created_at', c.created_at
  ) order by c.created_at, c.id), '[]'::jsonb)
  into messages
  from (
    select *
    from public.match_chat_messages
    where match_id = requested_match_id
      and expires_at > clock_timestamp()
      and (requested_after is null or created_at > requested_after)
    order by created_at desc
    limit 100
  ) c
  join public.profiles p on p.id = c.sender_id;
  return messages;
end;
$$;

create or replace function public.report_match_chat_message(
  requested_message_id uuid,
  requested_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_row public.match_chat_messages;
begin
  select * into message_row
  from public.match_chat_messages
  where id = requested_message_id;
  if not found
    or not public.match_chat_visible(message_row.match_id)
    or message_row.sender_id = auth.uid() then
    raise exception using errcode = 'P0001', message = 'QD_CHAT_MESSAGE_NOT_FOUND';
  end if;
  if requested_reason not in ('harassment', 'spam', 'personal_info', 'other') then
    raise exception using errcode = 'P0001', message = 'QD_CHAT_REPORT_INVALID';
  end if;
  perform public.check_rate_limit('chat_report', 6, 3600);
  insert into public.match_chat_reports (message_id, reporter_id, reason)
  values (requested_message_id, auth.uid(), requested_reason)
  on conflict do nothing;
  insert into public.abuse_flags (user_id, match_id, signal, severity, evidence)
  values (
    message_row.sender_id,
    message_row.match_id,
    'match_chat_report',
    2,
    jsonb_build_object('message_id', requested_message_id, 'reason', requested_reason)
  )
  on conflict do nothing;
  return true;
end;
$$;

with duplicate_flags as (
  select id
  from (
    select
      id,
      row_number() over (
        partition by coalesce(user_id::text, ''), coalesce(match_id::text, ''), signal
        order by created_at, id
      ) as duplicate_number
    from public.abuse_flags
    where status in ('open', 'reviewing')
  ) ranked
  where duplicate_number > 1
)
update public.abuse_flags
set
  status = 'dismissed',
  reviewed_at = clock_timestamp(),
  evidence = evidence || '{"deduplicated_by_migration":true}'::jsonb
where id in (select id from duplicate_flags);

create unique index abuse_flags_open_dedup_idx
  on public.abuse_flags (
    coalesce(user_id::text, ''),
    coalesce(match_id::text, ''),
    signal
  )
  where status in ('open', 'reviewing');

create or replace function public.flag_ranked_farming_patterns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_id uuid;
  recent_matches integer;
  distinct_opponents integer;
  pair_matches integer;
begin
  if old.status = 'completed'
    or new.status <> 'completed'
    or not new.ranked
    or new.completion_reason in ('double_timeout', 'admin_invalidated') then
    return new;
  end if;
  for player_id in
    select user_id from public.match_players where match_id = new.id
  loop
    select
      count(*),
      count(distinct opponent.user_id)
    into recent_matches, distinct_opponents
    from public.match_players mine
    join public.matches recent on recent.id = mine.match_id
    join public.match_players opponent
      on opponent.match_id = recent.id and opponent.user_id <> mine.user_id
    where mine.user_id = player_id
      and recent.ranked
      and recent.status = 'completed'
      and recent.completed_at > clock_timestamp() - interval '24 hours';
    if recent_matches >= 10 and distinct_opponents <= 2 then
      insert into public.abuse_flags (
        user_id, match_id, signal, severity, evidence
      ) values (
        player_id,
        new.id,
        'low_ranked_opponent_diversity',
        2,
        jsonb_build_object(
          'window', '24 hours',
          'matches', recent_matches,
          'distinct_opponents', distinct_opponents
        )
      ) on conflict do nothing;
    end if;
  end loop;

  select count(*) into pair_matches
  from public.matches pair_match
  where pair_match.ranked
    and pair_match.status = 'completed'
    and pair_match.completed_at > clock_timestamp() - interval '24 hours'
    and (
      select array_agg(mp.user_id order by mp.user_id)
      from public.match_players mp where mp.match_id = pair_match.id
    ) = (
      select array_agg(mp.user_id order by mp.user_id)
      from public.match_players mp where mp.match_id = new.id
    );
  if pair_matches >= 6 then
    insert into public.abuse_flags (
      user_id, match_id, signal, severity, evidence
    )
    select
      mp.user_id,
      new.id,
      'high_frequency_ranked_pair',
      2,
      jsonb_build_object('window', '24 hours', 'pair_matches', pair_matches)
    from public.match_players mp
    where mp.match_id = new.id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger matches_after_integrity_review
after update of status on public.matches
for each row execute function public.flag_ranked_farming_patterns();

create or replace function public.cleanup_integrity_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  network_deleted integer;
  chat_deleted integer;
  cron_runs_deleted integer;
begin
  delete from public.network_rate_limit_buckets
  where expires_at <= clock_timestamp();
  get diagnostics network_deleted = row_count;
  delete from public.match_chat_messages
  where expires_at <= clock_timestamp();
  get diagnostics chat_deleted = row_count;
  delete from cron.job_run_details
  where end_time < clock_timestamp() - interval '7 days';
  get diagnostics cron_runs_deleted = row_count;
  return jsonb_build_object(
    'network_buckets_deleted', network_deleted,
    'chat_messages_deleted', chat_deleted,
    'cron_runs_deleted', cron_runs_deleted
  );
end;
$$;

create or replace function public.run_ranked_integrity_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  finalization jsonb;
  cleanup jsonb;
begin
  finalization := public.finalize_expired_matches(200);
  cleanup := public.cleanup_integrity_data();
  return jsonb_build_object(
    'finalization', finalization,
    'cleanup', cleanup
  );
end;
$$;

alter table public.integrity_runtime enable row level security;
alter table public.network_rate_limit_buckets enable row level security;
alter table public.match_chat_messages enable row level security;
alter table public.match_chat_reports enable row level security;

create policy "Participants read match chat"
on public.match_chat_messages for select to authenticated
using (public.match_chat_visible(match_id));

revoke all on public.integrity_runtime from public, anon, authenticated;
revoke all on public.network_rate_limit_buckets from public, anon, authenticated;
revoke all on public.match_chat_messages from public, anon, authenticated;
revoke all on public.match_chat_reports from public, anon, authenticated;
grant select on public.match_chat_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_chat_messages'
  ) then
    alter publication supabase_realtime add table public.match_chat_messages;
  end if;
end;
$$;

revoke all on function public.ranked_forfeit_grace_seconds() from public, anon, authenticated;
revoke all on function public.finalize_match_outcome_locked(uuid, boolean) from public, anon, authenticated;
revoke all on function public.finalize_expired_match(uuid) from public, anon, authenticated;
revoke all on function public.finalize_expired_matches(integer) from public, anon, authenticated;
revoke all on function public.check_network_rate_limit(text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.is_public_rank_eligible(uuid) from public, anon, authenticated;
revoke all on function public.get_my_rank_eligibility() from public, anon, authenticated;
revoke all on function public.match_chat_visible(uuid) from public, anon, authenticated;
revoke all on function public.send_match_chat_message(uuid, text) from public, anon, authenticated;
revoke all on function public.get_match_chat(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.report_match_chat_message(uuid, text) from public, anon, authenticated;
revoke all on function public.cleanup_integrity_data() from public, anon, authenticated;
revoke all on function public.run_ranked_integrity_maintenance() from public, anon, authenticated;
revoke all on function public.flag_ranked_farming_patterns() from public, anon, authenticated;
revoke all on function public.get_public_leaderboard(integer) from public, anon, authenticated;

grant execute on function public.finalize_expired_match(uuid) to authenticated, service_role;
grant execute on function public.finalize_expired_matches(integer) to service_role;
grant execute on function public.check_network_rate_limit(text, text, integer, integer) to service_role;
grant execute on function public.is_public_rank_eligible(uuid) to anon, authenticated;
grant execute on function public.get_my_rank_eligibility() to authenticated;
grant execute on function public.get_public_leaderboard(integer) to anon, authenticated;
grant execute on function public.match_chat_visible(uuid) to authenticated;
grant execute on function public.send_match_chat_message(uuid, text) to authenticated;
grant execute on function public.get_match_chat(uuid, timestamptz) to authenticated;
grant execute on function public.report_match_chat_message(uuid, text) to authenticated;
grant execute on function public.cleanup_integrity_data() to service_role;
grant execute on function public.run_ranked_integrity_maintenance() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname = 'quickduel-ranked-integrity-sweep'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'quickduel-ranked-integrity-sweep',
    '* * * * *',
    'select public.run_ranked_integrity_maintenance();'
  );
end;
$$;

commit;
