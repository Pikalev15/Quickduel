begin;

alter table public.profiles
  add column accent_colour text not null default 'volt'
  check (accent_colour in ('volt', 'cyan', 'coral', 'violet', 'white'));

create table public.game_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_type text not null,
  played integer not null default 0 check (played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  best_rank_score numeric(16,6),
  best_time_ms integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_type)
);

alter table public.matchmaking_queue
  add column playlist text not null default 'quick'
    check (playlist in ('quick', 'sensory', 'mind', 'experimental')),
  add column preferred_game text;

alter table public.matches
  drop constraint matches_game_type_check,
  add constraint matches_game_type_check check (
    game_type in (
      'memory_grid', 'frequency_recall', 'colour_recall', 'time_recall',
      'shape_recall', 'rhythm_recall', 'dot_estimate', 'number_order',
      'odd_one_out', 'pattern_complete', 'reaction_test', 'target_tap'
    )
  ),
  add column game_version smallint not null default 1 check (game_version = 1),
  add column ranked boolean not null default true;

alter table public.matches alter column answer_duration_ms set default 8000;

alter table public.match_players
  drop constraint submitted_fields_consistency,
  alter column calculated_score type numeric(16,6),
  add column submission_json jsonb,
  add column result_json jsonb;

create index game_stats_game_leaderboard_idx
  on public.game_stats (game_type, wins desc, best_rank_score desc);
create index matchmaking_queue_preferences_idx
  on public.matchmaking_queue (playlist, preferred_game, joined_at);

create or replace function public.update_profile(
  requested_display_name text,
  requested_accent_colour text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_name text := btrim(requested_display_name);
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if normalized_name !~ '^[A-Za-z][A-Za-z0-9 _-]{2,23}$' then
    raise exception 'Name must be 3-24 characters and start with a letter';
  end if;
  if requested_accent_colour not in ('volt', 'cyan', 'coral', 'violet', 'white') then
    raise exception 'Accent colour is invalid';
  end if;
  if exists (
    select 1 from public.profiles
    where lower(display_name) = lower(normalized_name) and id <> caller_id
  ) then
    raise exception 'That display name is already taken';
  end if;

  update public.profiles
  set display_name = normalized_name, accent_colour = requested_accent_colour
  where id = caller_id;
  return public.get_my_profile();
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  profile_row public.profiles;
  player_rank integer;
  stats_json jsonb;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  select * into profile_row from public.profiles where id = caller_id;
  if not found then return public.ensure_profile(); end if;
  select 1 + count(*) into player_rank
  from public.profiles where rating > profile_row.rating;
  select coalesce(jsonb_object_agg(game_type, to_jsonb(s) - 'user_id' - 'game_type'), '{}'::jsonb)
  into stats_json
  from public.game_stats s
  where user_id = caller_id;
  return jsonb_build_object(
    'id', profile_row.id,
    'display_name', profile_row.display_name,
    'accent_colour', profile_row.accent_colour,
    'rating', profile_row.rating,
    'wins', profile_row.wins,
    'losses', profile_row.losses,
    'draws', profile_row.draws,
    'matches_played', profile_row.matches_played,
    'rank', player_rank,
    'game_stats', stats_json
  );
end;
$$;

drop function if exists public.join_matchmaking();
drop function if exists public.heartbeat_matchmaking();

create or replace function public.join_matchmaking(
  requested_playlist text default 'quick',
  requested_game text default null
)
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
  selected_game text;
  selected_ranked boolean;
  reveal_ms integer;
  answer_ms integer;
  sensory_games constant text[] := array[
    'frequency_recall', 'colour_recall', 'time_recall', 'shape_recall', 'rhythm_recall'
  ];
  mind_games constant text[] := array[
    'memory_grid', 'dot_estimate', 'number_order', 'odd_one_out', 'pattern_complete'
  ];
  experimental_games constant text[] := array['reaction_test', 'target_tap'];
  quick_games constant text[] := array[
    'memory_grid', 'frequency_recall', 'colour_recall', 'time_recall',
    'shape_recall', 'rhythm_recall', 'dot_estimate', 'number_order',
    'odd_one_out', 'pattern_complete'
  ];
  game_pool text[];
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if requested_playlist not in ('quick', 'sensory', 'mind', 'experimental') then
    raise exception 'Playlist is invalid';
  end if;
  game_pool := case requested_playlist
    when 'sensory' then sensory_games
    when 'mind' then mind_games
    when 'experimental' then experimental_games
    else quick_games
  end;
  if requested_game is not null and not requested_game = any(game_pool) then
    raise exception 'Preferred game is not in this playlist';
  end if;

  perform public.ensure_profile();
  select * into caller_profile from public.profiles where id = caller_id for update;
  select mp.match_id into existing_match_id
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = caller_id
    and m.status in ('waiting', 'countdown', 'active')
    and m.expires_at > now()
  order by m.created_at desc limit 1;
  if existing_match_id is not null then
    delete from public.matchmaking_queue where user_id = caller_id;
    return jsonb_build_object('queued', false, 'match_id', existing_match_id);
  end if;

  delete from public.matchmaking_queue where expires_at <= now();
  select last_seen_at into previous_heartbeat
  from public.matchmaking_queue where user_id = caller_id;
  if previous_heartbeat > now() - interval '750 milliseconds' then
    return jsonb_build_object('queued', true, 'match_id', null);
  end if;

  insert into public.matchmaking_queue (
    user_id, rating, playlist, preferred_game, joined_at, last_seen_at, expires_at
  ) values (
    caller_id, caller_profile.rating, requested_playlist, requested_game,
    now(), now(), now() + interval '20 seconds'
  )
  on conflict (user_id) do update set
    rating = excluded.rating,
    playlist = excluded.playlist,
    preferred_game = excluded.preferred_game,
    last_seen_at = excluded.last_seen_at,
    expires_at = excluded.expires_at;

  select q.* into opponent_row
  from public.matchmaking_queue q
  where q.user_id <> caller_id
    and q.expires_at > now()
    and q.playlist = requested_playlist
    and (requested_game is null or q.preferred_game is null or q.preferred_game = requested_game)
    and abs(q.rating - caller_profile.rating) <=
      150 + least(650, extract(epoch from (now() - q.joined_at))::integer * 25)
  order by
    case when q.preferred_game = requested_game then 0 else 1 end,
    abs(q.rating - caller_profile.rating),
    q.joined_at
  limit 1 for update skip locked;

  if opponent_row.user_id is null then
    return jsonb_build_object('queued', true, 'match_id', null);
  end if;

  created_seed := floor(random() * 2147483646)::bigint + 1;
  selected_game := coalesce(
    case when requested_game = opponent_row.preferred_game then requested_game end,
    requested_game,
    opponent_row.preferred_game,
    game_pool[1 + mod(created_seed, cardinality(game_pool))::integer]
  );
  selected_ranked := not selected_game = any(experimental_games);
  reveal_ms := case selected_game
    when 'memory_grid' then 1750 when 'frequency_recall' then 2400
    when 'colour_recall' then 2600 when 'time_recall' then 6500
    when 'shape_recall' then 2600 when 'rhythm_recall' then 6500
    when 'dot_estimate' then 2200 else 0 end;
  answer_ms := case selected_game
    when 'memory_grid' then 8000 when 'frequency_recall' then 12000
    when 'colour_recall' then 16000 when 'time_recall' then 14000
    when 'shape_recall' then 14000 when 'rhythm_recall' then 20000
    when 'dot_estimate' then 7000 when 'number_order' then 12000
    when 'odd_one_out' then 6000 when 'pattern_complete' then 18000
    when 'reaction_test' then 18000 when 'target_tap' then 16000
    else 8000 end;

  insert into public.matches (
    challenge_seed, game_type, ranked, reveal_duration_ms,
    answer_duration_ms, expires_at
  ) values (
    created_seed, selected_game, selected_ranked, reveal_ms,
    answer_ms, now() + interval '120 seconds'
  ) returning id into created_match_id;

  insert into public.match_players (match_id, user_id, rating_before)
  select created_match_id, p.id, p.rating
  from public.profiles p where p.id in (caller_id, opponent_row.user_id);
  delete from public.matchmaking_queue
  where user_id in (caller_id, opponent_row.user_id);
  return jsonb_build_object('queued', false, 'match_id', created_match_id);
end;
$$;

create or replace function public.heartbeat_matchmaking(
  requested_playlist text default 'quick',
  requested_game text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.matchmaking_queue where expires_at <= now();
  update public.matchmaking_queue
  set last_seen_at = now(), expires_at = now() + interval '20 seconds'
  where user_id = auth.uid();
  return public.join_matchmaking(requested_playlist, requested_game);
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
  select * into match_row from public.matches where id = requested_match_id;
  if not found then return null; end if;
  if match_row.status in ('waiting', 'countdown', 'active') and match_row.expires_at <= now() then
    update public.matches set status = 'abandoned'
    where id = requested_match_id and status in ('waiting', 'countdown', 'active');
    match_row.status := 'abandoned';
  end if;
  select jsonb_agg(
    jsonb_build_object(
      'user_id', mp.user_id, 'display_name', p.display_name,
      'ready_at', mp.ready_at, 'submitted_at', mp.submitted_at,
      'calculated_score', mp.calculated_score,
      'correct_count', mp.correct_count, 'incorrect_count', mp.incorrect_count,
      'completion_time_ms', mp.completion_time_ms,
      'rating_before', mp.rating_before, 'rating_after', mp.rating_after,
      'rating_delta', mp.rating_delta, 'result', mp.result_json,
      'rematch_requested_at', mp.rematch_requested_at
    ) order by mp.user_id
  ) into players_json
  from public.match_players mp join public.profiles p on p.id = mp.user_id
  where mp.match_id = requested_match_id;
  return jsonb_build_object(
    'id', match_row.id, 'status', match_row.status,
    'game_type', match_row.game_type, 'game_version', match_row.game_version,
    'ranked', match_row.ranked,
    'reveal_duration_ms', match_row.reveal_duration_ms,
    'answer_duration_ms', match_row.answer_duration_ms,
    'starts_at', match_row.starts_at, 'expires_at', match_row.expires_at,
    'winner_id', match_row.winner_id, 'completed_at', match_row.completed_at,
    'rematch_match_id', match_row.rematch_match_id,
    'current_user_id', caller_id, 'players', players_json
  );
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
    raise exception 'Payload is invalid';
  end if;
  select * into match_row from public.matches
  where id = requested_match_id for update;
  if not found or match_row.status in ('completed', 'abandoned', 'cancelled') then
    raise exception 'Match is no longer active';
  end if;
  if not exists (
    select 1 from public.match_players
    where match_id = requested_match_id and user_id = requested_user_id
  ) then raise exception 'Player is not in this match'; end if;
  answer_started_at := match_row.starts_at
    + make_interval(secs => match_row.reveal_duration_ms::double precision / 1000);
  if clock_timestamp() < answer_started_at then raise exception 'Answer phase has not started'; end if;
  if clock_timestamp() > answer_started_at
    + make_interval(secs => (match_row.answer_duration_ms + 1500)::double precision / 1000)
  then raise exception 'Answer period expired'; end if;
  elapsed_ms := least(match_row.answer_duration_ms, greatest(0,
    round(extract(epoch from (clock_timestamp() - answer_started_at)) * 1000)
  ));
  update public.match_players set
    submitted_at = clock_timestamp(), submission_json = submitted_payload,
    result_json = calculated_result, calculated_score = calculated_rank_score,
    correct_count = calculated_correct, incorrect_count = calculated_incorrect,
    completion_time_ms = elapsed_ms,
    selected_cells = '{}'::smallint[]
  where match_id = requested_match_id and user_id = requested_user_id
    and submitted_at is null;
  if not found then raise exception 'Answer already submitted'; end if;
  update public.matches set status = 'active'
  where id = requested_match_id and status = 'countdown';
  perform public.finalize_match_locked(requested_match_id);
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
  first_delta integer := 0;
  second_delta integer := 0;
  first_after integer;
  second_after integer;
begin
  select * into match_row from public.matches where id = requested_match_id for update;
  if not found or match_row.status = 'completed' then return; end if;
  select * into first_player from public.match_players
  where match_id = requested_match_id order by user_id limit 1;
  select * into second_player from public.match_players
  where match_id = requested_match_id order by user_id offset 1 limit 1;
  if first_player.submitted_at is null or second_player.submitted_at is null then return; end if;

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

  first_after := first_player.rating_before;
  second_after := second_player.rating_before;
  if match_row.ranked then
    first_expected := 1 / (1 + power(10,
      (second_player.rating_before - first_player.rating_before)::numeric / 400));
    first_delta := round(32 * (first_actual - first_expected));
    second_delta := round(32 * (second_actual - (1 - first_expected)));
    first_after := least(4000, greatest(100, first_player.rating_before + first_delta));
    second_after := least(4000, greatest(100, second_player.rating_before + second_delta));
    update public.profiles set
      rating = case when id = first_player.user_id then first_after else second_after end,
      wins = wins + case when id = winner then 1 else 0 end,
      losses = losses + case when winner is not null and id <> winner then 1 else 0 end,
      draws = draws + case when winner is null then 1 else 0 end,
      matches_played = matches_played + 1
    where id in (first_player.user_id, second_player.user_id);
  end if;

  update public.match_players set
    rating_after = case when user_id = first_player.user_id then first_after else second_after end,
    rating_delta = case when user_id = first_player.user_id then first_delta else second_delta end
  where match_id = requested_match_id;

  insert into public.game_stats (
    user_id, game_type, played, wins, losses, draws, best_rank_score, best_time_ms
  )
  select
    mp.user_id, match_row.game_type, 1,
    case when mp.user_id = winner then 1 else 0 end,
    case when winner is not null and mp.user_id <> winner then 1 else 0 end,
    case when winner is null then 1 else 0 end,
    mp.calculated_score, mp.completion_time_ms
  from public.match_players mp where mp.match_id = requested_match_id
  on conflict (user_id, game_type) do update set
    played = public.game_stats.played + 1,
    wins = public.game_stats.wins + excluded.wins,
    losses = public.game_stats.losses + excluded.losses,
    draws = public.game_stats.draws + excluded.draws,
    best_rank_score = greatest(public.game_stats.best_rank_score, excluded.best_rank_score),
    best_time_ms = least(public.game_stats.best_time_ms, excluded.best_time_ms),
    updated_at = now();

  update public.matches set status = 'completed', winner_id = winner,
    completed_at = now() where id = requested_match_id and status <> 'completed';
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
  select * into original_match from public.matches
  where id = requested_match_id for update;
  if not found or original_match.status <> 'completed'
    or not public.is_match_participant(requested_match_id) then
    raise exception 'Completed match not found';
  end if;
  if original_match.completed_at < now() - interval '60 seconds' then
    raise exception 'Rematch window expired';
  end if;
  update public.match_players set rematch_requested_at = coalesce(rematch_requested_at, now())
  where match_id = requested_match_id and user_id = caller_id;
  select count(*) into accepted_count from public.match_players
  where match_id = requested_match_id and rematch_requested_at is not null;
  if accepted_count = 2 and original_match.rematch_match_id is null then
    insert into public.matches (
      challenge_seed, game_type, game_version, ranked,
      reveal_duration_ms, answer_duration_ms, expires_at
    ) values (
      floor(random() * 2147483646)::bigint + 1, original_match.game_type,
      original_match.game_version, original_match.ranked,
      original_match.reveal_duration_ms, original_match.answer_duration_ms,
      now() + interval '120 seconds'
    ) returning id into created_match_id;
    insert into public.match_players (match_id, user_id, rating_before)
    select created_match_id, p.id, p.rating
    from public.match_players old_mp join public.profiles p on p.id = old_mp.user_id
    where old_mp.match_id = requested_match_id;
    update public.matches set rematch_match_id = created_match_id
    where id = requested_match_id and rematch_match_id is null;
  else
    created_match_id := original_match.rematch_match_id;
  end if;
  return jsonb_build_object('accepted', true, 'waiting', accepted_count < 2, 'match_id', created_match_id);
end;
$$;

alter table public.game_stats enable row level security;
create policy "Players read their own per-game stats"
on public.game_stats for select to authenticated using (user_id = auth.uid());
revoke all on public.game_stats from anon, authenticated;
grant select on public.game_stats to authenticated;

revoke all on function public.update_profile(text, text) from public, anon, authenticated;
revoke all on function public.join_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.heartbeat_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.submit_game_result(uuid, uuid, jsonb, jsonb, numeric, smallint, smallint)
  from public, anon, authenticated;
grant execute on function public.update_profile(text, text) to authenticated;
grant execute on function public.join_matchmaking(text, text) to authenticated;
grant execute on function public.heartbeat_matchmaking(text, text) to authenticated;
grant execute on function public.submit_game_result(uuid, uuid, jsonb, jsonb, numeric, smallint, smallint)
  to service_role;

-- Ranked challenge seeds are server-only. Participants use the phase-filtered
-- challenge returned by the Next.js server, never direct table access.
revoke select on public.matches from authenticated;
grant select (
  id, game_type, status, grid_size, highlight_count, reveal_duration_ms,
  answer_duration_ms, starts_at, expires_at, winner_id, rematch_match_id,
  created_at, completed_at, game_version, ranked
) on public.matches to authenticated;

commit;
