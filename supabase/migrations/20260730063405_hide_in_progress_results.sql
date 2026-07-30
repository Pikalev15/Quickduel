begin;

drop function if exists public.submit_match_answer(uuid, integer[]);

revoke select on public.match_players from authenticated;
grant select (
  match_id, user_id, ready_at, submitted_at, rating_before, rating_after,
  rating_delta, rematch_requested_at
) on public.match_players to authenticated;

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
  if match_row.status in ('waiting', 'countdown', 'active')
    and match_row.expires_at <= now() then
    update public.matches set status = 'abandoned'
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

revoke all on function public.get_match_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.get_match_snapshot(uuid) to authenticated;

commit;
