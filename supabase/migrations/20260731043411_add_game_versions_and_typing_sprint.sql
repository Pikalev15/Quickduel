begin;

alter table public.matches
  drop constraint matches_game_type_check,
  drop constraint matches_game_version_check,
  add constraint matches_game_type_check check (
    game_type in (
      'memory_grid',
      'frequency_recall',
      'frequency_recall_v2',
      'colour_recall',
      'colour_recall_v2',
      'time_recall',
      'shape_recall',
      'rhythm_recall',
      'dot_estimate',
      'number_order',
      'odd_one_out',
      'pattern_complete',
      'typing_sprint',
      'reaction_test',
      'target_tap'
    )
  ),
  add constraint matches_game_version_check check (
    (
      game_type in ('frequency_recall_v2', 'colour_recall_v2')
      and game_version = 2
    )
    or (
      game_type in (
        'memory_grid',
        'frequency_recall',
        'colour_recall',
        'time_recall',
        'shape_recall',
        'rhythm_recall',
        'dot_estimate',
        'number_order',
        'odd_one_out',
        'pattern_complete',
        'typing_sprint',
        'reaction_test',
        'target_tap'
      )
      and game_version = 1
    )
  );

create or replace function public.game_reveal_duration(requested_game text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case requested_game
    when 'memory_grid' then 1750
    when 'frequency_recall' then 2400
    when 'frequency_recall_v2' then 0
    when 'colour_recall' then 2600
    when 'colour_recall_v2' then 0
    when 'time_recall' then 6500
    when 'shape_recall' then 2600
    when 'rhythm_recall' then 6500
    when 'dot_estimate' then 2200
    else 0
  end;
$$;

create or replace function public.game_answer_duration(requested_game text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case requested_game
    when 'memory_grid' then 8000
    when 'frequency_recall' then 12000
    when 'frequency_recall_v2' then 30000
    when 'colour_recall' then 16000
    when 'colour_recall_v2' then 40000
    when 'time_recall' then 14000
    when 'shape_recall' then 14000
    when 'rhythm_recall' then 20000
    when 'dot_estimate' then 7000
    when 'number_order' then 8000
    when 'odd_one_out' then 6000
    when 'pattern_complete' then 18000
    when 'typing_sprint' then 15000
    when 'reaction_test' then 18000
    when 'target_tap' then 16000
    else 8000
  end;
$$;

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
  selected_version smallint;
  sensory_games constant text[] := array[
    'frequency_recall_v2', 'colour_recall_v2', 'time_recall',
    'shape_recall', 'rhythm_recall'
  ];
  mind_games constant text[] := array[
    'memory_grid', 'dot_estimate', 'number_order', 'odd_one_out',
    'pattern_complete', 'typing_sprint'
  ];
  experimental_games constant text[] := array['reaction_test', 'target_tap'];
  quick_games constant text[] := array[
    'memory_grid', 'frequency_recall_v2', 'colour_recall_v2', 'time_recall',
    'shape_recall', 'rhythm_recall', 'dot_estimate', 'number_order',
    'odd_one_out', 'pattern_complete', 'typing_sprint'
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
  select * into caller_profile
  from public.profiles
  where id = caller_id
  for update;

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
    return jsonb_build_object('queued', false, 'match_id', existing_match_id);
  end if;

  delete from public.matchmaking_queue where expires_at <= now();
  select last_seen_at into previous_heartbeat
  from public.matchmaking_queue
  where user_id = caller_id;
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
    and (
      requested_game is null
      or q.preferred_game is null
      or q.preferred_game = requested_game
    )
    and abs(q.rating - caller_profile.rating) <=
      150 + least(
        650,
        extract(epoch from (now() - q.joined_at))::integer * 25
      )
  order by
    case when q.preferred_game = requested_game then 0 else 1 end,
    abs(q.rating - caller_profile.rating),
    q.joined_at
  limit 1
  for update skip locked;

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
  selected_version := case
    when selected_game in ('frequency_recall_v2', 'colour_recall_v2') then 2
    else 1
  end;

  insert into public.matches (
    challenge_seed,
    game_type,
    game_version,
    ranked,
    reveal_duration_ms,
    answer_duration_ms,
    expires_at
  ) values (
    created_seed,
    selected_game,
    selected_version,
    selected_ranked,
    public.game_reveal_duration(selected_game),
    public.game_answer_duration(selected_game),
    now() + interval '120 seconds'
  )
  returning id into created_match_id;

  insert into public.match_players (match_id, user_id, rating_before)
  select created_match_id, p.id, p.rating
  from public.profiles p
  where p.id in (caller_id, opponent_row.user_id);

  delete from public.matchmaking_queue
  where user_id in (caller_id, opponent_row.user_id);

  return jsonb_build_object('queued', false, 'match_id', created_match_id);
end;
$$;

create or replace function public.private_duel_game(
  requested_duel public.private_duels,
  requested_round integer
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  sensory_games constant text[] := array[
    'frequency_recall_v2', 'colour_recall_v2', 'time_recall',
    'shape_recall', 'rhythm_recall'
  ];
  mind_games constant text[] := array[
    'memory_grid', 'dot_estimate', 'number_order', 'odd_one_out',
    'pattern_complete', 'typing_sprint'
  ];
  experimental_games constant text[] := array['reaction_test', 'target_tap'];
  quick_games constant text[] := array[
    'memory_grid', 'frequency_recall_v2', 'colour_recall_v2', 'time_recall',
    'shape_recall', 'rhythm_recall', 'dot_estimate', 'number_order',
    'odd_one_out', 'pattern_complete', 'typing_sprint'
  ];
  pool text[];
begin
  if requested_duel.game_type is not null then
    return requested_duel.game_type;
  end if;
  pool := case requested_duel.playlist
    when 'sensory' then sensory_games
    when 'mind' then mind_games
    when 'experimental' then experimental_games
    else quick_games
  end;
  return pool[
    1 + mod(
      abs(mod(
        hashtextextended(
          requested_duel.id::text || ':' || requested_round::text,
          0
        ),
        cardinality(pool)::bigint
      )),
      cardinality(pool)::bigint
    )::integer
  ];
end;
$$;

create or replace function public.create_private_duel_match(
  requested_duel_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  duel_row public.private_duels;
  selected_game text;
  selected_version smallint;
  created_match_id uuid;
  created_seed bigint;
begin
  select * into duel_row
  from public.private_duels
  where id = requested_duel_id
  for update;

  if not found
    or duel_row.guest_id is null
    or duel_row.state in ('completed', 'expired', 'cancelled') then
    raise exception 'Duel is not ready';
  end if;

  if duel_row.current_match_id is not null and exists (
    select 1
    from public.matches
    where id = duel_row.current_match_id
      and status in ('waiting', 'countdown', 'active')
  ) then
    return duel_row.current_match_id;
  end if;

  created_seed := floor(random() * 2147483646)::bigint + 1;
  selected_game := public.private_duel_game(
    duel_row,
    duel_row.current_round + 1
  );
  selected_version := case
    when selected_game in ('frequency_recall_v2', 'colour_recall_v2') then 2
    else 1
  end;

  insert into public.matches (
    challenge_seed,
    game_type,
    game_version,
    ranked,
    reveal_duration_ms,
    answer_duration_ms,
    expires_at,
    source,
    playlist,
    private_duel_id,
    series_round
  ) values (
    created_seed,
    selected_game,
    selected_version,
    duel_row.ranked and selected_game not in ('reaction_test', 'target_tap'),
    public.game_reveal_duration(selected_game),
    public.game_answer_duration(selected_game),
    now() + interval '3 minutes',
    'private_duel',
    duel_row.playlist,
    duel_row.id,
    duel_row.current_round + 1
  )
  returning id into created_match_id;

  insert into public.match_players (match_id, user_id, rating_before)
  select created_match_id, p.id, p.rating
  from public.profiles p
  where p.id in (duel_row.host_id, duel_row.guest_id);

  update public.private_duels
  set
    state = 'active',
    current_round = current_round + 1,
    current_match_id = created_match_id
  where id = duel_row.id;

  return created_match_id;
end;
$$;

create or replace function public.create_private_duel(
  requested_selection_kind text,
  requested_game text,
  requested_playlist text,
  requested_best_of smallint,
  requested_ranked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  generated_code text;
  created_duel public.private_duels;
  valid_games constant text[] := array[
    'memory_grid', 'frequency_recall_v2', 'colour_recall_v2', 'time_recall',
    'shape_recall', 'rhythm_recall', 'dot_estimate', 'number_order',
    'odd_one_out', 'pattern_complete', 'typing_sprint',
    'reaction_test', 'target_tap'
  ];
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_profile();
  perform public.check_rate_limit('private_duel_create', 8, 3600);

  if requested_selection_kind not in ('game', 'playlist')
    or requested_best_of not in (1, 3, 5)
    or requested_playlist not in ('quick', 'sensory', 'mind', 'experimental') then
    raise exception 'Duel settings are invalid';
  end if;

  if requested_selection_kind = 'game'
    and (
      requested_game is null
      or not requested_game = any(valid_games)
    ) then
    raise exception 'Game is invalid';
  end if;

  if requested_ranked
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Ranked private duels require a linked account';
  end if;

  if requested_ranked and (
    requested_playlist = 'experimental'
    or requested_game in ('reaction_test', 'target_tap')
  ) then
    raise exception 'Experimental games cannot be ranked';
  end if;

  loop
    generated_code := upper(substr(
      translate(
        encode(extensions.gen_random_bytes(8), 'base64'),
        '/+=',
        'XYZ'
      ),
      1,
      8
    ));
    exit when generated_code ~ '^[A-Z0-9]{8}$'
      and not exists (
        select 1
        from public.private_duels
        where code = generated_code
      );
  end loop;

  insert into public.private_duels (
    code,
    host_id,
    selection_kind,
    game_type,
    playlist,
    best_of,
    ranked
  ) values (
    generated_code,
    caller_id,
    requested_selection_kind,
    case when requested_selection_kind = 'game' then requested_game else null end,
    requested_playlist,
    requested_best_of,
    requested_ranked
  )
  returning * into created_duel;

  return jsonb_build_object(
    'code', created_duel.code,
    'state', created_duel.state,
    'expires_at', created_duel.expires_at
  );
end;
$$;

revoke all on function public.game_reveal_duration(text)
  from public, anon, authenticated;
revoke all on function public.game_answer_duration(text)
  from public, anon, authenticated;
revoke all on function public.join_matchmaking(text, text)
  from public, anon, authenticated;
revoke all on function public.private_duel_game(public.private_duels, integer)
  from public, anon, authenticated;
revoke all on function public.create_private_duel_match(uuid)
  from public, anon, authenticated;
revoke all on function public.create_private_duel(
  text, text, text, smallint, boolean
) from public, anon, authenticated;

grant execute on function public.join_matchmaking(text, text)
  to authenticated;
grant execute on function public.create_private_duel(
  text, text, text, smallint, boolean
) to authenticated;

commit;
