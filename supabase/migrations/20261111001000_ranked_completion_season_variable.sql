-- Avoid PL/pgSQL variable/column ambiguity in both season upserts.
create or replace function public.after_match_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row record;
  opponent_id uuid;
  active_season_id text;
  pair_low uuid;
  pair_high uuid;
  counted integer;
  duel_row public.private_duels;
  wins_needed integer;
  should_finish boolean;
begin
  if old.status = 'completed' or new.status <> 'completed' then return new; end if;

  for player_row in
    select
      mp.user_id,
      mp.rating_after,
      mp.calculated_score,
      mp.completion_time_ms,
      mp.result_json,
      mp.submission_json,
      case
        when new.winner_id is null then 'draw'
        when new.winner_id = mp.user_id then 'win'
        else 'loss'
      end as outcome
    from public.match_players mp
    where mp.match_id = new.id
  loop
    insert into public.user_progression (
      user_id, highest_rating, current_win_streak, best_win_streak, updated_at
    )
    values (
      player_row.user_id,
      coalesce(player_row.rating_after, 1000),
      case when player_row.outcome = 'win' then 1 else 0 end,
      case when player_row.outcome = 'win' then 1 else 0 end,
      now()
    )
    on conflict (user_id) do update set
      highest_rating = greatest(
        public.user_progression.highest_rating,
        coalesce(player_row.rating_after, public.user_progression.highest_rating)
      ),
      current_win_streak = case
        when player_row.outcome = 'win'
          then public.user_progression.current_win_streak + 1
        else 0
      end,
      best_win_streak = greatest(
        public.user_progression.best_win_streak,
        case when player_row.outcome = 'win'
          then public.user_progression.current_win_streak + 1
          else public.user_progression.best_win_streak
        end
      ),
      updated_at = now();
    update public.game_stats
    set
      total_rank_score = total_rank_score + coalesce(player_row.calculated_score, 0),
      total_time_ms = total_time_ms + coalesce(player_row.completion_time_ms, 0),
      recent_results = public.trim_recent_game_results(
        recent_results,
        jsonb_build_object(
          'at', new.completed_at,
          'score', player_row.calculated_score,
          'time_ms', player_row.completion_time_ms,
          'outcome', player_row.outcome
        )
      )
    where user_id = player_row.user_id and game_type = new.game_type;

    if coalesce((player_row.result_json ->> 'accuracy')::numeric, 0) >= 0.999
      and (
        select count(*)
        from public.match_players recent_player
        join public.matches recent_match on recent_match.id = recent_player.match_id
        where recent_player.user_id = player_row.user_id
          and recent_match.status = 'completed'
          and recent_match.completed_at > now() - interval '24 hours'
          and coalesce((recent_player.result_json ->> 'accuracy')::numeric, 0) >= 0.999
      ) >= 5
      and not exists (
        select 1 from public.abuse_flags
        where user_id = player_row.user_id
          and signal = 'excessive_perfect_scores'
          and created_at > now() - interval '1 hour'
      ) then
      insert into public.abuse_flags (user_id, match_id, signal, severity, evidence)
      values (
        player_row.user_id,
        new.id,
        'excessive_perfect_scores',
        2,
        jsonb_build_object('window', '24 hours', 'threshold', 5)
      );
    end if;

    if not (player_row.submission_json ? 'timedOut')
      and (
        select count(*)
        from public.match_players repeated_player
        join public.matches repeated_match on repeated_match.id = repeated_player.match_id
        where repeated_player.user_id = player_row.user_id
          and repeated_match.status = 'completed'
          and repeated_match.game_type = new.game_type
          and repeated_match.completed_at > now() - interval '24 hours'
          and repeated_player.submission_json = player_row.submission_json
      ) >= 4
      and not exists (
        select 1 from public.abuse_flags
        where user_id = player_row.user_id
          and signal = 'repeated_identical_submission'
          and created_at > now() - interval '1 hour'
      ) then
      insert into public.abuse_flags (user_id, match_id, signal, severity, evidence)
      values (
        player_row.user_id,
        new.id,
        'repeated_identical_submission',
        2,
        jsonb_build_object('game_type', new.game_type, 'window', '24 hours')
      );
    end if;
  end loop;

  insert into public.audit_log (
    action, target_match_id, metadata
  )
  values (
    'rating_finalized',
    new.id,
    jsonb_build_object('ranked', new.ranked, 'source', new.source)
  );

  if new.ranked and new.invalidated_at is null then
    select mp.user_id into pair_low
    from public.match_players mp where mp.match_id = new.id
    order by mp.user_id::text limit 1;
    select mp.user_id into pair_high
    from public.match_players mp where mp.match_id = new.id
    order by mp.user_id::text desc limit 1;
    active_season_id := public.current_season_id();
    insert into public.season_pair_daily_counts (
      season_id, player_low, player_high, match_day, matches_counted
    )
    values (
      active_season_id, pair_low, pair_high, (now() at time zone 'UTC')::date, 1
    )
    on conflict (season_id, player_low, player_high, match_day)
    do update set matches_counted =
      public.season_pair_daily_counts.matches_counted + 1
    where public.season_pair_daily_counts.matches_counted < 3
    returning matches_counted into counted;
    if counted is not null then
      for player_row in
        select mp.user_id,
          case
            when new.winner_id is null then 1
            when new.winner_id = mp.user_id then 3
            else 0
          end as points,
          case when new.winner_id = mp.user_id then 1 else 0 end as won,
          case when new.winner_id is not null and new.winner_id <> mp.user_id then 1 else 0 end as lost,
          case when new.winner_id is null then 1 else 0 end as drawn
        from public.match_players mp where mp.match_id = new.id
      loop
        insert into public.season_player_stats (
          season_id, user_id, points, wins, losses, draws, matches_counted
        )
        values (
          active_season_id, player_row.user_id, player_row.points,
          player_row.won, player_row.lost, player_row.drawn, 1
        )
        on conflict (season_id, user_id) do update set
          points = public.season_player_stats.points + excluded.points,
          wins = public.season_player_stats.wins + excluded.wins,
          losses = public.season_player_stats.losses + excluded.losses,
          draws = public.season_player_stats.draws + excluded.draws,
          matches_counted = public.season_player_stats.matches_counted + 1,
          updated_at = now();
      end loop;
    else
      insert into public.abuse_flags (user_id, match_id, signal, severity, evidence)
      select
        mp.user_id,
        new.id,
        'repeated_ranked_pair',
        2,
        jsonb_build_object('daily_counting_limit', 3, 'season_id', active_season_id)
      from public.match_players mp
      where mp.match_id = new.id;
    end if;
  end if;

  if new.private_duel_id is not null then
    select * into duel_row from public.private_duels
    where id = new.private_duel_id for update;
    update public.private_duels
    set
      host_score = host_score + case when new.winner_id = duel_row.host_id then 1 else 0 end,
      guest_score = guest_score + case when new.winner_id = duel_row.guest_id then 1 else 0 end
    where id = duel_row.id
    returning * into duel_row;
    wins_needed := (duel_row.best_of + 1) / 2;
    should_finish := duel_row.host_score >= wins_needed
      or duel_row.guest_score >= wins_needed
      or duel_row.current_round >= duel_row.best_of;
    if should_finish then
      update public.private_duels
      set state = 'completed', completed_at = now()
      where id = duel_row.id;
    else
      update public.private_duels set current_match_id = null where id = duel_row.id;
      perform public.create_private_duel_match(duel_row.id);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.after_match_completed() from public, anon, authenticated;
