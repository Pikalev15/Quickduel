begin;

create extension if not exists pgcrypto with schema extensions;

create type public.match_status as enum (
  'waiting',
  'countdown',
  'active',
  'completed',
  'abandoned',
  'cancelled'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique
    check (display_name ~ '^[A-Za-z][A-Za-z0-9]{2,23}$'),
  rating integer not null default 1000 check (rating between 100 and 4000),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  matches_played integer not null default 0 check (matches_played >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.matchmaking_queue (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 100 and 4000),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '20 seconds')
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game_type text not null default 'memory_grid'
    check (game_type = 'memory_grid'),
  status public.match_status not null default 'waiting',
  challenge_seed bigint not null,
  grid_size smallint not null default 4 check (grid_size between 2 and 8),
  highlight_count smallint not null default 6
    check (highlight_count > 0 and highlight_count < grid_size * grid_size),
  reveal_duration_ms integer not null default 1750
    check (reveal_duration_ms between 500 and 10000),
  answer_duration_ms integer not null default 12000
    check (answer_duration_ms between 1000 and 60000),
  starts_at timestamptz,
  expires_at timestamptz not null,
  winner_id uuid references public.profiles(id),
  rematch_match_id uuid references public.matches(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint completed_state_consistency check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  ready_at timestamptz,
  submitted_at timestamptz,
  selected_cells smallint[],
  calculated_score numeric(6,2),
  correct_count smallint,
  incorrect_count smallint,
  completion_time_ms integer,
  rating_before integer not null check (rating_before between 100 and 4000),
  rating_after integer check (rating_after between 100 and 4000),
  rating_delta integer,
  rematch_requested_at timestamptz,
  primary key (match_id, user_id),
  constraint submitted_fields_consistency check (
    (submitted_at is null
      and selected_cells is null
      and calculated_score is null
      and completion_time_ms is null)
    or
    (submitted_at is not null
      and selected_cells is not null
      and calculated_score is not null
      and completion_time_ms is not null)
  )
);

create index profiles_leaderboard_idx
  on public.profiles (rating desc, wins desc, created_at asc);
create index matchmaking_queue_expiry_idx
  on public.matchmaking_queue (expires_at, joined_at);
create index matchmaking_queue_rating_idx
  on public.matchmaking_queue (rating, joined_at);
create index matches_active_idx
  on public.matches (status, expires_at)
  where status in ('waiting', 'countdown', 'active');
create index match_players_user_history_idx
  on public.match_players (user_id, match_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.generated_display_name(requested_user_id uuid)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  adjectives constant text[] := array[
    'Brisk', 'Calm', 'Clever', 'Cosmic', 'Daring', 'Gentle', 'Jolly',
    'Keen', 'Lucky', 'Mighty', 'Nimble', 'Quiet', 'Rapid', 'Swift',
    'Vivid', 'Witty'
  ];
  animals constant text[] := array[
    'Badger', 'Falcon', 'Fox', 'Koala', 'Lynx', 'Otter', 'Owl',
    'Panda', 'Raven', 'Seal', 'Tiger', 'Wolf', 'Yak', 'Zebra'
  ];
  digest text := md5(requested_user_id::text);
  first_index integer;
  second_index integer;
begin
  first_index := 1 + (('x' || substr(digest, 1, 8))::bit(32)::bigint
    % array_length(adjectives, 1));
  second_index := 1 + (('x' || substr(digest, 9, 8))::bit(32)::bigint
    % array_length(animals, 1));
  return adjectives[first_index] || animals[second_index]
    || substr(replace(requested_user_id::text, '-', ''), 1, 8);
end;
$$;

create or replace function public.ensure_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  result_profile public.profiles;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.profiles (id, display_name)
  values (caller_id, public.generated_display_name(caller_id))
  on conflict (id) do nothing;

  select * into result_profile
  from public.profiles
  where id = caller_id;

  return jsonb_build_object(
    'id', result_profile.id,
    'display_name', result_profile.display_name,
    'rating', result_profile.rating
  );
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.generated_display_name(new.id))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger create_profile_for_auth_user
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.is_match_participant(requested_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.match_players
    where match_id = requested_match_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.generate_highlighted_cells(
  requested_seed bigint,
  requested_grid_size integer,
  requested_count integer
)
returns smallint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  modulus constant bigint := 2147483647;
  multiplier constant bigint := 48271;
  state bigint := mod(mod(requested_seed, modulus) + modulus, modulus);
  cell_count integer := requested_grid_size * requested_grid_size;
  result_cells smallint[] := '{}'::smallint[];
  candidate smallint;
begin
  if requested_grid_size < 2 or requested_grid_size > 8
    or requested_count < 1 or requested_count >= cell_count then
    raise exception 'Invalid challenge configuration';
  end if;
  if state = 0 then state := 1; end if;

  while cardinality(result_cells) < requested_count loop
    state := mod(state * multiplier, modulus);
    candidate := mod(state, cell_count)::smallint;
    if not candidate = any(result_cells) then
      result_cells := array_append(result_cells, candidate);
    end if;
  end loop;

  select array_agg(cell order by cell)
  into result_cells
  from unnest(result_cells) as cell;
  return result_cells;
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  profile_row public.profiles;
  player_rank integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  select * into profile_row from public.profiles where id = caller_id;
  if not found then return public.ensure_profile(); end if;
  select 1 + count(*) into player_rank
  from public.profiles
  where rating > profile_row.rating;
  return jsonb_build_object(
    'id', profile_row.id,
    'display_name', profile_row.display_name,
    'rating', profile_row.rating,
    'wins', profile_row.wins,
    'losses', profile_row.losses,
    'draws', profile_row.draws,
    'matches_played', profile_row.matches_played,
    'rank', player_rank
  );
end;
$$;

create or replace function public.get_public_leaderboard(result_limit integer default 100)
returns table (
  rank bigint,
  id uuid,
  display_name text,
  rating integer,
  wins integer,
  losses integer,
  draws integer,
  matches_played integer
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
    p.id,
    p.display_name,
    p.rating,
    p.wins,
    p.losses,
    p.draws,
    p.matches_played
  from public.profiles p
  order by p.rating desc, p.wins desc, p.created_at asc
  limit least(greatest(result_limit, 1), 100);
$$;

create or replace function public.get_public_activity()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'online_count',
    (
      select count(distinct user_id)
      from (
        select q.user_id
        from public.matchmaking_queue q
        where q.expires_at > now()
        union
        select mp.user_id
        from public.match_players mp
        join public.matches m on m.id = mp.match_id
        where m.status in ('waiting', 'countdown', 'active')
          and m.expires_at > now()
      ) active_users
    )
  );
$$;

create or replace function public.join_matchmaking()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_profile public.profiles;
  opponent_row public.matchmaking_queue;
  existing_match_id uuid;
  created_match_id uuid;
  created_seed bigint;
  previous_heartbeat timestamptz;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_profile();
  select * into caller_profile
  from public.profiles where id = caller_id for update;

  select mp.match_id into existing_match_id
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = caller_id
    and m.status in ('waiting', 'countdown', 'active')
    and m.expires_at > now()
  order by m.created_at desc
  limit 1;
  if existing_match_id is not null then
    delete from public.matchmaking_queue where user_id = caller_id;
    return jsonb_build_object(
      'queued', false,
      'match_id', existing_match_id
    );
  end if;

  delete from public.matchmaking_queue where expires_at <= now();

  select last_seen_at into previous_heartbeat
  from public.matchmaking_queue
  where user_id = caller_id;
  if previous_heartbeat > now() - interval '750 milliseconds' then
    return jsonb_build_object('queued', true, 'match_id', null);
  end if;

  insert into public.matchmaking_queue (
    user_id, rating, joined_at, last_seen_at, expires_at
  )
  values (
    caller_id, caller_profile.rating, now(), now(), now() + interval '20 seconds'
  )
  on conflict (user_id) do update set
    rating = excluded.rating,
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at;

  select q.* into opponent_row
  from public.matchmaking_queue q
  where q.user_id <> caller_id
    and q.expires_at > now()
    and abs(q.rating - caller_profile.rating) <=
      150 + least(650, extract(epoch from (now() - q.joined_at))::integer * 25)
  order by
    abs(q.rating - caller_profile.rating),
    q.joined_at
  limit 1
  for update skip locked;

  if opponent_row.user_id is null then
    return jsonb_build_object('queued', true, 'match_id', null);
  end if;

  created_seed := floor(random() * 2147483646)::bigint + 1;
  insert into public.matches (
    challenge_seed, expires_at
  )
  values (
    created_seed, now() + interval '90 seconds'
  )
  returning id into created_match_id;

  insert into public.match_players (match_id, user_id, rating_before)
  select created_match_id, p.id, p.rating
  from public.profiles p
  where p.id in (caller_id, opponent_row.user_id);

  delete from public.matchmaking_queue
  where user_id in (caller_id, opponent_row.user_id);

  return jsonb_build_object(
    'queued', false,
    'match_id', created_match_id
  );
end;
$$;

create or replace function public.heartbeat_matchmaking()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  delete from public.matchmaking_queue where expires_at <= now();
  update public.matchmaking_queue
  set last_seen_at = now(), expires_at = now() + interval '20 seconds'
  where user_id = caller_id;
  return public.join_matchmaking();
end;
$$;

create or replace function public.leave_matchmaking()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.matchmaking_queue where user_id = auth.uid();
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
  if caller_id is null then raise exception 'Authentication required'; end if;
  if not public.is_match_participant(requested_match_id) then
    raise exception 'Not a match participant';
  end if;

  select * into match_row
  from public.matches
  where id = requested_match_id;
  if not found then return null; end if;

  if match_row.status in ('waiting', 'countdown', 'active')
    and match_row.expires_at <= now() then
    update public.matches
    set status = 'abandoned'
    where id = requested_match_id
      and status in ('waiting', 'countdown', 'active');
    match_row.status := 'abandoned';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'user_id', mp.user_id,
      'display_name', p.display_name,
      'ready_at', mp.ready_at,
      'submitted_at', mp.submitted_at,
      'calculated_score', mp.calculated_score,
      'correct_count', mp.correct_count,
      'incorrect_count', mp.incorrect_count,
      'completion_time_ms', mp.completion_time_ms,
      'rating_before', mp.rating_before,
      'rating_after', mp.rating_after,
      'rating_delta', mp.rating_delta,
      'rematch_requested_at', mp.rematch_requested_at
    )
    order by mp.user_id
  ) into players_json
  from public.match_players mp
  join public.profiles p on p.id = mp.user_id
  where mp.match_id = requested_match_id;

  return jsonb_build_object(
    'id', match_row.id,
    'status', match_row.status,
    'challenge_seed', match_row.challenge_seed::text,
    'grid_size', match_row.grid_size,
    'highlight_count', match_row.highlight_count,
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
  if caller_id is null then raise exception 'Authentication required'; end if;
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found or not public.is_match_participant(requested_match_id) then
    raise exception 'Match not found';
  end if;
  if match_row.status not in ('waiting', 'countdown') then
    raise exception 'Match cannot be readied';
  end if;

  update public.match_players
  set ready_at = coalesce(ready_at, now())
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
      expires_at = official_start
        + make_interval(secs => (
          reveal_duration_ms + answer_duration_ms + 5000
        )::double precision / 1000)
    where id = requested_match_id;
  end if;

  return public.get_match_snapshot(requested_match_id);
end;
$$;

create or replace function public.finalize_match_locked(requested_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_row public.matches;
  first_player public.match_players;
  second_player public.match_players;
  winner uuid;
  first_actual numeric;
  second_actual numeric;
  first_expected numeric;
  second_expected numeric;
  first_delta integer;
  second_delta integer;
  first_after integer;
  second_after integer;
begin
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found or match_row.status = 'completed' then return; end if;

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
  if first_player.submitted_at is null or second_player.submitted_at is null then
    return;
  end if;

  if first_player.calculated_score > second_player.calculated_score then
    winner := first_player.user_id;
    first_actual := 1; second_actual := 0;
  elsif first_player.calculated_score < second_player.calculated_score then
    winner := second_player.user_id;
    first_actual := 0; second_actual := 1;
  elsif abs(
    first_player.completion_time_ms - second_player.completion_time_ms
  ) <= 10 then
    winner := null;
    first_actual := 0.5; second_actual := 0.5;
  elsif first_player.completion_time_ms < second_player.completion_time_ms then
    winner := first_player.user_id;
    first_actual := 1; second_actual := 0;
  else
    winner := second_player.user_id;
    first_actual := 0; second_actual := 1;
  end if;

  first_expected := 1 / (
    1 + power(10, (second_player.rating_before - first_player.rating_before)::numeric / 400)
  );
  second_expected := 1 - first_expected;
  first_delta := round(32 * (first_actual - first_expected));
  second_delta := round(32 * (second_actual - second_expected));
  first_after := least(4000, greatest(100, first_player.rating_before + first_delta));
  second_after := least(4000, greatest(100, second_player.rating_before + second_delta));

  update public.match_players
  set
    rating_after = case
      when user_id = first_player.user_id then first_after else second_after end,
    rating_delta = case
      when user_id = first_player.user_id
        then first_after - first_player.rating_before
      else second_after - second_player.rating_before end
  where match_id = requested_match_id;

  update public.profiles
  set
    rating = case when id = first_player.user_id then first_after else second_after end,
    wins = wins + case when id = winner then 1 else 0 end,
    losses = losses + case when winner is not null and id <> winner then 1 else 0 end,
    draws = draws + case when winner is null then 1 else 0 end,
    matches_played = matches_played + 1
  where id in (first_player.user_id, second_player.user_id);

  update public.matches
  set
    status = 'completed',
    winner_id = winner,
    completed_at = now()
  where id = requested_match_id
    and status <> 'completed';
end;
$$;

create or replace function public.submit_match_answer(
  requested_match_id uuid,
  submitted_cells integer[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  match_row public.matches;
  expected_cells smallint[];
  normalized_cells smallint[];
  correct_total smallint;
  incorrect_total smallint;
  calculated numeric(6,2);
  answer_started_at timestamptz;
  elapsed_ms integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found or not public.is_match_participant(requested_match_id) then
    raise exception 'Match not found';
  end if;
  if match_row.status in ('completed', 'abandoned', 'cancelled') then
    raise exception 'Match is no longer active';
  end if;
  if match_row.starts_at is null then raise exception 'Match has not started'; end if;

  answer_started_at := match_row.starts_at
    + make_interval(secs => match_row.reveal_duration_ms::double precision / 1000);
  if clock_timestamp() < answer_started_at then
    raise exception 'Answer phase has not started';
  end if;
  if clock_timestamp() >
    answer_started_at
      + make_interval(secs => match_row.answer_duration_ms::double precision / 1000)
  then
    raise exception 'Answer period expired';
  end if;
  if submitted_cells is null
    or cardinality(submitted_cells) < 1
    or cardinality(submitted_cells) > match_row.grid_size * match_row.grid_size
    or exists (
      select 1 from unnest(submitted_cells) cell
      where cell < 0 or cell >= match_row.grid_size * match_row.grid_size
    )
    or cardinality(submitted_cells) <> (
      select count(distinct cell) from unnest(submitted_cells) cell
    )
  then
    raise exception 'Selected cells are invalid';
  end if;

  expected_cells := public.generate_highlighted_cells(
    match_row.challenge_seed,
    match_row.grid_size,
    match_row.highlight_count
  );
  select array_agg(cell::smallint order by cell)
  into normalized_cells
  from unnest(submitted_cells) cell;
  select count(*)::smallint into correct_total
  from unnest(normalized_cells) cell
  where cell = any(expected_cells);
  incorrect_total := cardinality(normalized_cells) - correct_total;
  calculated := correct_total - incorrect_total * 0.5;
  elapsed_ms := least(
    match_row.answer_duration_ms,
    greatest(
      0,
      round(extract(epoch from (clock_timestamp() - answer_started_at)) * 1000)
    )
  );

  update public.match_players
  set
    submitted_at = clock_timestamp(),
    selected_cells = normalized_cells,
    calculated_score = calculated,
    correct_count = correct_total,
    incorrect_count = incorrect_total,
    completion_time_ms = elapsed_ms
  where match_id = requested_match_id
    and user_id = caller_id
    and submitted_at is null;
  if not found then raise exception 'Answer already submitted'; end if;

  update public.matches
  set status = 'active'
  where id = requested_match_id and status = 'countdown';

  perform public.finalize_match_locked(requested_match_id);
  return public.get_match_snapshot(requested_match_id);
end;
$$;

create or replace function public.request_rematch(requested_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  original_match public.matches;
  accepted_count integer;
  created_match_id uuid;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  select * into original_match
  from public.matches
  where id = requested_match_id
  for update;
  if not found or original_match.status <> 'completed'
    or not public.is_match_participant(requested_match_id) then
    raise exception 'Completed match not found';
  end if;
  if original_match.completed_at < now() - interval '60 seconds' then
    raise exception 'Rematch window expired';
  end if;

  update public.match_players
  set rematch_requested_at = coalesce(rematch_requested_at, now())
  where match_id = requested_match_id and user_id = caller_id;
  select count(*) into accepted_count
  from public.match_players
  where match_id = requested_match_id
    and rematch_requested_at is not null;

  if accepted_count = 2 and original_match.rematch_match_id is null then
    insert into public.matches (challenge_seed, expires_at)
    values (
      floor(random() * 2147483646)::bigint + 1,
      now() + interval '90 seconds'
    )
    returning id into created_match_id;
    insert into public.match_players (match_id, user_id, rating_before)
    select created_match_id, p.id, p.rating
    from public.match_players old_mp
    join public.profiles p on p.id = old_mp.user_id
    where old_mp.match_id = requested_match_id;
    update public.matches
    set rematch_match_id = created_match_id
    where id = requested_match_id and rematch_match_id is null;
  else
    created_match_id := original_match.rematch_match_id;
  end if;

  return jsonb_build_object(
    'accepted', true,
    'waiting', accepted_count < 2,
    'match_id', created_match_id
  );
end;
$$;

alter table public.profiles enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;

comment on table public.matchmaking_queue is
  'No direct client policies: queue mutation and matching are RPC-only.';
comment on table public.match_players is
  'Clients may read participant state for their own match but never write scores or ratings.';

create policy "Authenticated users read public profile fields"
on public.profiles for select
to authenticated
using (true);

create policy "Participants read their matches"
on public.matches for select
to authenticated
using (public.is_match_participant(id));

create policy "Participants read both match player rows"
on public.match_players for select
to authenticated
using (public.is_match_participant(match_id));

create or replace function public.can_access_match_topic(requested_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  topic_match_id uuid;
begin
  if requested_topic !~ '^match:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;
  topic_match_id := split_part(requested_topic, ':', 2)::uuid;
  return exists (
    select 1
    from public.match_players
    where match_id = topic_match_id
      and user_id = auth.uid()
  );
end;
$$;

create policy "Match participants receive private presence"
on realtime.messages for select
to authenticated
using (
  extension = 'presence'
  and public.can_access_match_topic(realtime.topic())
);

create policy "Match participants publish private presence"
on realtime.messages for insert
to authenticated
with check (
  extension = 'presence'
  and public.can_access_match_topic(realtime.topic())
);

revoke all on public.profiles from anon, authenticated;
revoke all on public.matchmaking_queue from anon, authenticated;
revoke all on public.matches from anon, authenticated;
revoke all on public.match_players from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.matches to authenticated;
grant select on public.match_players to authenticated;

revoke all on function public.ensure_profile() from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.join_matchmaking() from public;
revoke all on function public.heartbeat_matchmaking() from public;
revoke all on function public.leave_matchmaking() from public;
revoke all on function public.get_match_snapshot(uuid) from public;
revoke all on function public.mark_match_ready(uuid) from public;
revoke all on function public.submit_match_answer(uuid, integer[]) from public;
revoke all on function public.request_rematch(uuid) from public;
revoke all on function public.finalize_match_locked(uuid) from public;
revoke all on function public.get_public_leaderboard(integer) from public;
revoke all on function public.get_public_activity() from public;
revoke all on function public.can_access_match_topic(text) from public;

grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.join_matchmaking() to authenticated;
grant execute on function public.heartbeat_matchmaking() to authenticated;
grant execute on function public.leave_matchmaking() to authenticated;
grant execute on function public.get_match_snapshot(uuid) to authenticated;
grant execute on function public.mark_match_ready(uuid) to authenticated;
grant execute on function public.submit_match_answer(uuid, integer[]) to authenticated;
grant execute on function public.request_rematch(uuid) to authenticated;
grant execute on function public.get_public_leaderboard(integer) to anon, authenticated;
grant execute on function public.get_public_activity() to anon, authenticated;
grant execute on function public.can_access_match_topic(text) to authenticated;

alter publication supabase_realtime
  add table public.matches, public.match_players;

commit;
