begin;

-- Public shares may expose summary metrics and per-round scores, never targets,
-- guesses, submissions, or signed round errors.
create or replace function public.get_public_match_share(requested_code text)
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
  select * into match_row
  from public.matches
  where share_code = upper(requested_code)
    and share_enabled
    and status = 'completed';
  if not found then return null; end if;

  select jsonb_agg(jsonb_build_object(
    'display_name', p.display_name,
    'summary', mp.result_json ->> 'summary',
    'details', case
      when match_row.game_type in ('frequency_recall_v2', 'colour_recall_v2')
        then jsonb_build_object(
          'totalScore', mp.result_json -> 'details' -> 'totalScore',
          'closestRound', mp.result_json -> 'details' -> 'closestRound',
          'bestRound', mp.result_json -> 'details' -> 'bestRound',
          'averageError', mp.result_json -> 'details' -> 'averageError',
          'averageDistance', mp.result_json -> 'details' -> 'averageDistance',
          'round1Score', mp.result_json -> 'details' -> 'round1Score',
          'round2Score', mp.result_json -> 'details' -> 'round2Score',
          'round3Score', mp.result_json -> 'details' -> 'round3Score',
          'round4Score', mp.result_json -> 'details' -> 'round4Score',
          'round5Score', mp.result_json -> 'details' -> 'round5Score',
          'round1Answered', mp.result_json -> 'details' -> 'round1Answered',
          'round2Answered', mp.result_json -> 'details' -> 'round2Answered',
          'round3Answered', mp.result_json -> 'details' -> 'round3Answered',
          'round4Answered', mp.result_json -> 'details' -> 'round4Answered',
          'round5Answered', mp.result_json -> 'details' -> 'round5Answered'
        )
      else null
    end,
    'rating_delta', mp.rating_delta,
    'winner', match_row.winner_id = mp.user_id
  ) order by mp.user_id)
  into players_json
  from public.match_players mp
  join public.profiles p on p.id = mp.user_id
  where mp.match_id = match_row.id;

  return jsonb_build_object(
    'code', match_row.share_code,
    'game_type', match_row.game_type,
    'ranked', match_row.ranked,
    'completed_at', match_row.completed_at,
    'source', match_row.source,
    'series_round', match_row.series_round,
    'players', players_json
  );
end;
$$;

revoke all on function public.get_public_match_share(text) from public, anon, authenticated;
grant execute on function public.get_public_match_share(text) to anon, authenticated;

commit;
