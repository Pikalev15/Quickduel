-- Pending migration candidate: generate a timestamped migration with the Supabase CLI.
-- New frequency matches get 0.8s reveal, 8.2s answer and 2s feedback (55s nominal).
-- 60s persisted budget leaves 5s transition slack; old 30s matches retain old timing.
-- Verify on a disposable migrated database before applying to production.
BEGIN;

CREATE OR REPLACE FUNCTION public.game_answer_duration(requested_game text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case requested_game
    when 'memory_grid' then 8000
    when 'frequency_recall' then 12000
    when 'frequency_recall_v2' then 60000
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
$function$

CREATE OR REPLACE FUNCTION public.advance_recall_round(requested_match_id uuid, requested_user_id uuid, requested_target_round_index smallint, requested_target jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  match_row public.matches;
  round_row public.match_rounds;
  current_time timestamptz := clock_timestamp();
  reveal_ms integer;
  answer_ms integer;
  next_round smallint;
  participant_ids uuid[];
  participant_id uuid;
  own_submission public.match_round_submissions;
  opponent_submission public.match_round_submissions;
  own_score numeric := 0;
  opponent_score numeric := 0;
  own_real_rounds integer := 0;
  opponent_id uuid;
  phase text;
  exposed_target jsonb := null;
  exposed_feedback jsonb := null;
  result_details jsonb;
  best_round integer;
  average_error numeric;
begin
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;

  if not found
    or match_row.game_type not in ('frequency_recall_v2', 'colour_recall_v2')
    or match_row.game_version <> 2 then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  if not exists (
    select 1 from public.match_players mp
    where mp.match_id = requested_match_id and mp.user_id = requested_user_id
  ) then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;
  if (
    match_row.game_type = 'frequency_recall_v2'
    and (
      jsonb_typeof(requested_target) <> 'number'
      or (requested_target #>> '{}')::numeric not between 120 and 2000
    )
  ) or (
    match_row.game_type = 'colour_recall_v2'
    and (
      jsonb_typeof(requested_target) <> 'object'
      or not requested_target ?& array['l', 'c', 'h']
      or (requested_target->>'l')::numeric not between 35 and 90
      or (requested_target->>'c')::numeric not between 4 and 32
      or (requested_target->>'h')::numeric not between 0 and 359
    )
  ) then
    raise exception using errcode = 'P0001', message = 'QD_ROUND_TARGET_INVALID';
  end if;
  if match_row.status in ('completed', 'cancelled', 'abandoned') then
    return jsonb_build_object(
      'gameId', match_row.game_type,
      'roundIndex', 4,
      'roundCount', 5,
      'phase', 'complete',
      'phaseEndsAt', null,
      'target', null,
      'ownAnswer', null,
      'feedback', null,
      'ownSubmitted', true,
      'opponentSubmitted', true,
      'ownScore', 0,
      'opponentScore', 0
    );
  end if;
  if match_row.starts_at is null or current_time < match_row.starts_at then
    return jsonb_build_object(
      'gameId', match_row.game_type,
      'roundIndex', 0,
      'roundCount', 5,
      'phase', 'countdown',
      'phaseEndsAt', match_row.starts_at,
      'target', null,
      'ownAnswer', null,
      'feedback', null,
      'ownSubmitted', false,
      'opponentSubmitted', false,
      'ownScore', 0,
      'opponentScore', 0
    );
  end if;

  reveal_ms := 800;
  answer_ms := case
    when match_row.game_type = 'frequency_recall_v2' and match_row.answer_duration_ms >= 60000 then 8200
    when match_row.game_type = 'frequency_recall_v2' then 3200
    else 5200
  end;

  select array_agg(mp.user_id order by mp.user_id) into participant_ids
  from public.match_players mp
  where mp.match_id = requested_match_id;
  if coalesce(array_length(participant_ids, 1), 0) <> 2 then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_PLAYERS_INVALID';
  end if;
  opponent_id := case
    when participant_ids[1] = requested_user_id then participant_ids[2]
    else participant_ids[1]
  end;

  select * into round_row
  from public.match_rounds mr
  where mr.match_id = requested_match_id
  order by mr.round_index desc
  limit 1
  for update;

  if not found then
    if requested_target_round_index <> 0 then
      raise exception using errcode = 'P0001', message = 'QD_ROUND_TARGET_MISMATCH';
    end if;
    insert into public.match_rounds (
      match_id, round_index, target_json, started_at,
      reveal_ends_at, answer_ends_at
    ) values (
      requested_match_id, 0, requested_target, current_time,
      current_time + make_interval(secs => reveal_ms::double precision / 1000),
      current_time + make_interval(
        secs => (reveal_ms + answer_ms)::double precision / 1000
      )
    )
    returning * into round_row;
    update public.matches
    set status = 'active'
    where id = requested_match_id and status = 'countdown';
  end if;

  if round_row.resolved_at is null
    and current_time >= round_row.answer_ends_at then
    foreach participant_id in array participant_ids loop
      insert into public.match_round_submissions (
        match_id, round_index, user_id, answer_json, feedback_json,
        score, timed_out, submitted_at
      ) values (
        requested_match_id,
        round_row.round_index,
        participant_id,
        '{"timedOut":true}'::jsonb,
        case
          when match_row.game_type = 'frequency_recall_v2' then
            jsonb_build_object(
              'kind', 'frequency',
              'targetHz', round_row.target_json,
              'guessHz', null,
              'differenceHz', null,
              'percentError', null,
              'centsError', null,
              'direction', 'none',
              'score', 0,
              'label', 'No answer'
            )
          else jsonb_build_object(
            'kind', 'colour',
            'target', round_row.target_json,
            'guess', null,
            'distance', null,
            'lightnessDifference', null,
            'chromaDifference', null,
            'hueDifference', null,
            'score', 0,
            'label', 'No answer'
          )
        end,
        0,
        true,
        round_row.answer_ends_at
      )
      on conflict (match_id, round_index, user_id) do nothing;
    end loop;
    update public.match_rounds
    set
      resolved_at = current_time,
      feedback_ends_at = current_time + interval '2 seconds'
    where match_id = requested_match_id
      and round_index = round_row.round_index
      and resolved_at is null
    returning * into round_row;
  end if;

  if round_row.resolved_at is not null
    and current_time >= round_row.feedback_ends_at then
    if round_row.round_index < 4 then
      next_round := round_row.round_index + 1;
      if requested_target_round_index <> next_round then
        raise exception using errcode = 'P0001', message = 'QD_ROUND_TARGET_MISMATCH';
      end if;
      insert into public.match_rounds (
        match_id, round_index, target_json, started_at,
        reveal_ends_at, answer_ends_at
      ) values (
        requested_match_id, next_round, requested_target, current_time,
        current_time + make_interval(secs => reveal_ms::double precision / 1000),
        current_time + make_interval(
          secs => (reveal_ms + answer_ms)::double precision / 1000
        )
      )
      on conflict (match_id, round_index) do nothing;
      select * into round_row
      from public.match_rounds mr
      where mr.match_id = requested_match_id and mr.round_index = next_round
      for update;
    else
      foreach participant_id in array participant_ids loop
        select count(*) into own_real_rounds
        from public.match_round_submissions mrs
        where mrs.match_id = requested_match_id
          and mrs.user_id = participant_id
          and not mrs.timed_out;

        if own_real_rounds > 0 then
          select
            coalesce(sum(mrs.score), 0),
            coalesce(
              jsonb_object_agg(
                'round' || (mrs.round_index + 1)::text || 'Score',
                mrs.score
              ),
              '{}'::jsonb
            ),
            min(mrs.round_index + 1) filter (
              where mrs.score = (
                select max(best.score)
                from public.match_round_submissions best
                where best.match_id = requested_match_id
                  and best.user_id = participant_id
              )
            ),
            avg(
              case
                when match_row.game_type = 'frequency_recall_v2'
                  then abs((mrs.feedback_json->>'centsError')::numeric)
                else (mrs.feedback_json->>'distance')::numeric
              end
            ) filter (where not mrs.timed_out)
          into own_score, result_details, best_round, average_error
          from public.match_round_submissions mrs
          where mrs.match_id = requested_match_id
            and mrs.user_id = participant_id;

          for next_round in 0..4 loop
            select * into round_row
            from public.match_rounds mr
            where mr.match_id = requested_match_id
              and mr.round_index = next_round;
            select * into own_submission
            from public.match_round_submissions mrs
            where mrs.match_id = requested_match_id
              and mrs.round_index = next_round
              and mrs.user_id = participant_id;
            result_details := result_details || case
              when match_row.game_type = 'frequency_recall_v2' then
                jsonb_build_object(
                  'round' || (next_round + 1)::text || 'Answered',
                    not own_submission.timed_out,
                  'round' || (next_round + 1)::text || 'Target',
                    round_row.target_json,
                  'round' || (next_round + 1)::text || 'Guess',
                    coalesce((own_submission.feedback_json->>'guessHz')::numeric, 0),
                  'round' || (next_round + 1)::text || 'PercentError',
                    coalesce((own_submission.feedback_json->>'percentError')::numeric, 0),
                  'round' || (next_round + 1)::text || 'Error',
                    coalesce((own_submission.feedback_json->>'centsError')::numeric, 0)
                )
              else jsonb_build_object(
                'round' || (next_round + 1)::text || 'Answered',
                  not own_submission.timed_out,
                'round' || (next_round + 1)::text || 'TargetL',
                  (round_row.target_json->>'l')::numeric,
                'round' || (next_round + 1)::text || 'TargetC',
                  (round_row.target_json->>'c')::numeric,
                'round' || (next_round + 1)::text || 'TargetH',
                  (round_row.target_json->>'h')::numeric,
                'round' || (next_round + 1)::text || 'GuessL',
                  coalesce((own_submission.feedback_json->'guess'->>'l')::numeric, 0),
                'round' || (next_round + 1)::text || 'GuessC',
                  coalesce((own_submission.feedback_json->'guess'->>'c')::numeric, 0),
                'round' || (next_round + 1)::text || 'GuessH',
                  coalesce((own_submission.feedback_json->'guess'->>'h')::numeric, 0),
                'round' || (next_round + 1)::text || 'Distance',
                  coalesce((own_submission.feedback_json->>'distance')::numeric, 0)
              )
            end;
          end loop;

          result_details := result_details || jsonb_build_object(
            'totalScore', own_score,
            case
              when match_row.game_type = 'frequency_recall_v2'
                then 'closestRound'
              else 'bestRound'
            end, best_round,
            case
              when match_row.game_type = 'frequency_recall_v2'
                then 'averageError'
              else 'averageDistance'
            end, coalesce(average_error, 0)
          );

          update public.match_players
          set
            submitted_at = current_time,
            submission_json = jsonb_build_object(
              'rounds',
              (
                select jsonb_agg(mrs.answer_json order by mrs.round_index)
                from public.match_round_submissions mrs
                where mrs.match_id = requested_match_id
                  and mrs.user_id = participant_id
              )
            ),
            result_json = jsonb_build_object(
              'rankScore', own_score,
              'accuracy', own_score / 50,
              'summary', round(own_score, 1)::text || '/50',
              'details', result_details
            ),
            calculated_score = own_score,
            correct_count = own_real_rounds,
            incorrect_count = 5 - own_real_rounds,
            completion_time_ms = match_row.answer_duration_ms,
            selected_cells = '{}'::smallint[]
          where match_id = requested_match_id
            and user_id = participant_id
            and submitted_at is null;
        end if;
      end loop;

      perform public.finalize_match_outcome_locked(requested_match_id, false);
      return jsonb_build_object(
        'gameId', match_row.game_type,
        'roundIndex', 4,
        'roundCount', 5,
        'phase', 'complete',
        'phaseEndsAt', null,
        'target', null,
        'ownAnswer', null,
        'feedback', null,
        'ownSubmitted', true,
        'opponentSubmitted', true,
        'ownScore', 0,
        'opponentScore', 0
      );
    end if;
  end if;

  select * into own_submission
  from public.match_round_submissions mrs
  where mrs.match_id = requested_match_id
    and mrs.round_index = round_row.round_index
    and mrs.user_id = requested_user_id;
  select * into opponent_submission
  from public.match_round_submissions mrs
  where mrs.match_id = requested_match_id
    and mrs.round_index = round_row.round_index
    and mrs.user_id = opponent_id;

  select coalesce(sum(mrs.score), 0) into own_score
  from public.match_round_submissions mrs
  join public.match_rounds mr
    on mr.match_id = mrs.match_id and mr.round_index = mrs.round_index
  where mrs.match_id = requested_match_id
    and mrs.user_id = requested_user_id
    and mr.resolved_at is not null;
  select coalesce(sum(mrs.score), 0) into opponent_score
  from public.match_round_submissions mrs
  join public.match_rounds mr
    on mr.match_id = mrs.match_id and mr.round_index = mrs.round_index
  where mrs.match_id = requested_match_id
    and mrs.user_id = opponent_id
    and mr.resolved_at is not null;

  if round_row.resolved_at is not null then
    phase := 'feedback';
    exposed_target := round_row.target_json;
    exposed_feedback := own_submission.feedback_json;
  elsif current_time < round_row.reveal_ends_at then
    phase := 'reveal';
    exposed_target := round_row.target_json;
  elsif own_submission.user_id is not null then
    phase := 'waiting';
  else
    phase := 'answer';
  end if;

  return jsonb_build_object(
    'gameId', match_row.game_type,
    'roundIndex', round_row.round_index,
    'roundCount', 5,
    'phase', phase,
    'phaseEndsAt', case
      when phase = 'reveal' then round_row.reveal_ends_at
      when phase in ('answer', 'waiting') then round_row.answer_ends_at
      when phase = 'feedback' then round_row.feedback_ends_at
      else null
    end,
    'target', exposed_target,
    'ownAnswer', case
      when round_row.resolved_at is not null and not own_submission.timed_out
        then own_submission.answer_json
      else null
    end,
    'feedback', exposed_feedback,
    'ownSubmitted', own_submission.user_id is not null,
    'opponentSubmitted', opponent_submission.user_id is not null,
    'ownScore', own_score,
    'opponentScore', opponent_score
  );
end;
$function$

REVOKE ALL ON FUNCTION public.game_answer_duration(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_answer_duration(text) TO service_role;
REVOKE ALL ON FUNCTION public.advance_recall_round(uuid, uuid, smallint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_recall_round(uuid, uuid, smallint, jsonb) TO service_role;
COMMIT;
