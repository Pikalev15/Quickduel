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
    when 'dot_estimate' then 7000 when 'number_order' then 8000
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
