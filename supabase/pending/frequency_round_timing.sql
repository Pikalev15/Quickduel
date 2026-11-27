-- Staged timing pass. Validate on a disposable migrated database before promoting to migrations.
-- Existing rows retain persisted budgets. New frequency rounds use a bounded listen gate.
BEGIN;

ALTER TABLE public.matches
  DROP CONSTRAINT matches_reveal_duration_ms_check,
  ADD CONSTRAINT matches_reveal_duration_ms_check CHECK (
    reveal_duration_ms BETWEEN 0 AND 10000
    OR (game_type = 'rhythm_recall' AND reveal_duration_ms = 13000)
  );

create or replace function public.game_reveal_duration(requested_game text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $function$
  select case requested_game
    when 'memory_grid' then 2500
    when 'frequency_recall' then 2400
    when 'frequency_recall_v2' then 0
    when 'colour_recall' then 2600
    when 'colour_recall_v2' then 0
    when 'time_recall' then 6500
    when 'shape_recall' then 2600
    when 'rhythm_recall' then 13000
    when 'dot_estimate' then 2200
    else 0
  end;
$function$;

revoke all on function public.game_reveal_duration(text)
  from public, anon, authenticated;


-- Service-only acknowledgments for new 60-second frequency matches.
CREATE TABLE public.frequency_listen_acks (
  match_id uuid NOT NULL,
  round_index smallint NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL,
  PRIMARY KEY (match_id, round_index, user_id),
  FOREIGN KEY (match_id, round_index) REFERENCES public.match_rounds(match_id, round_index) ON DELETE CASCADE
);
ALTER TABLE public.frequency_listen_acks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.frequency_listen_acks FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ack_frequency_listened(requested_match_id uuid, requested_user_id uuid, requested_round_index smallint)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $ack$
DECLARE
  m public.matches;
  r public.match_rounds;
  at_time timestamptz;
  gate_end timestamptz;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id=requested_match_id FOR UPDATE;
  IF NOT FOUND OR m.game_type <> 'frequency_recall_v2' OR m.game_version <> 2 OR m.answer_duration_ms < 60000
    OR m.status NOT IN ('countdown','active') OR NOT EXISTS (
      SELECT 1 FROM public.match_players WHERE match_id=m.id AND user_id=requested_user_id
    ) THEN RAISE EXCEPTION USING errcode='P0001',message='QD_MATCH_NOT_FOUND'; END IF;
  SELECT * INTO r FROM public.match_rounds WHERE match_id=m.id AND round_index=requested_round_index FOR UPDATE;
  IF NOT FOUND OR r.resolved_at IS NOT NULL THEN RAISE EXCEPTION USING errcode='P0001',message='QD_ROUND_CLOSED'; END IF;
  IF EXISTS (SELECT 1 FROM public.frequency_listen_acks WHERE match_id=m.id AND round_index=r.round_index AND user_id=requested_user_id) THEN RETURN; END IF;
  at_time := clock_timestamp();
  IF at_time >= r.reveal_ends_at OR at_time < r.started_at + interval '390 milliseconds'
    THEN RAISE EXCEPTION USING errcode='P0001',message='QD_ROUND_CLOSED'; END IF;
  INSERT INTO public.frequency_listen_acks VALUES(m.id,r.round_index,requested_user_id,at_time);
  IF (SELECT count(*) FROM public.frequency_listen_acks WHERE match_id=m.id AND round_index=r.round_index) = 2 THEN
    gate_end := least(r.reveal_ends_at,at_time+interval '250 milliseconds');
    UPDATE public.match_rounds SET reveal_ends_at=gate_end, answer_ends_at=gate_end+make_interval(secs =>
      (case when not m.ranked and to_jsonb(m)->'match_rules'->>'kind'='workshop'
        and to_jsonb(m)->'match_rules'->'rules'->>'roundAnswerMs' ~ '^[0-9]{4}$'
        then greatest(3000,least(6000,(to_jsonb(m)->'match_rules'->'rules'->>'roundAnswerMs')::integer))
        else 8200 end)::double precision / 1000)
      WHERE match_id=m.id AND round_index=r.round_index;
  END IF;
END;
$ack$;
REVOKE ALL ON FUNCTION public.ack_frequency_listened(uuid,uuid,smallint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ack_frequency_listened(uuid,uuid,smallint) TO service_role;

CREATE OR REPLACE FUNCTION public.game_answer_duration(requested_game text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case requested_game
    when 'memory_grid' then 7000
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
    when 'typing_sprint' then 30000
    when 'reaction_test' then 26000
    when 'target_tap' then 16000
    else 8000
  end;
$function$;

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
  listen_required boolean := false;
  listen_acknowledged boolean := false;
begin
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  current_time := clock_timestamp();

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

  listen_required := match_row.game_type = 'frequency_recall_v2' and match_row.answer_duration_ms >= 60000;
  reveal_ms := case when listen_required then 4000 else 800 end;
  answer_ms := case
    when match_row.game_type = 'frequency_recall_v2' and match_row.answer_duration_ms >= 60000 then 8200
    when match_row.game_type = 'frequency_recall_v2' then 3200
    else 5200
  end;
  -- Custom secure recall changes only the answer window. Keep the existing
  -- five-round score, reveal/listen gate, feedback, and overall time budget.
  if not match_row.ranked and to_jsonb(match_row)->'match_rules'->>'kind'='workshop'
    and to_jsonb(match_row)->'match_rules'->'rules'->>'roundAnswerMs' ~ '^[0-9]{4}$' then
    answer_ms := greatest(3000, least(
      case when match_row.game_type='frequency_recall_v2' then 6000 else 5200 end,
      (to_jsonb(match_row)->'match_rules'->'rules'->>'roundAnswerMs')::integer
    ));
  end if;

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

  if listen_required then
    select exists(select 1 from public.frequency_listen_acks where match_id=requested_match_id and round_index=round_row.round_index and user_id=requested_user_id) into listen_acknowledged;
  end if;

  if round_row.resolved_at is not null then
    phase := 'feedback';
    exposed_target := round_row.target_json;
    exposed_feedback := own_submission.feedback_json;
  elsif current_time < round_row.reveal_ends_at then
    phase := 'reveal';
    exposed_target := round_row.target_json;
  elsif own_submission.user_id is not null or (listen_required and not listen_acknowledged) then
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
    'listenRequired', listen_required,
    'listenAcknowledged', listen_acknowledged,
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
$function$;

create or replace function public.submit_recall_round(
  requested_match_id uuid,
  requested_user_id uuid,
  requested_round_index smallint,
  submitted_answer jsonb,
  calculated_feedback jsonb,
  calculated_score numeric
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  match_row public.matches;
  round_row public.match_rounds;
  existing_answer jsonb;
  current_time timestamptz := clock_timestamp();
  submission_count integer;
begin
  if submitted_answer is null or calculated_feedback is null
    or pg_column_size(submitted_answer) > 2048
    or pg_column_size(calculated_feedback) > 4096
    or calculated_score < 0 or calculated_score > 10 then
    raise exception using errcode = 'P0001', message = 'QD_INVALID_ROUND_SUBMISSION';
  end if;
  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found
    or match_row.status not in ('countdown', 'active')
    or match_row.game_type not in ('frequency_recall_v2', 'colour_recall_v2')
    or match_row.game_version <> 2
    or not exists (
      select 1 from public.match_players mp
      where mp.match_id = requested_match_id and mp.user_id = requested_user_id
    ) then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;

  select * into round_row
  from public.match_rounds mr
  where mr.match_id = requested_match_id
    and mr.round_index = requested_round_index
  for update;
  if not found or round_row.resolved_at is not null then
    raise exception using errcode = 'P0001', message = 'QD_ROUND_CLOSED';
  end if;
  current_time := clock_timestamp();
  if match_row.game_type = 'frequency_recall_v2' and match_row.answer_duration_ms >= 60000
    and not exists (select 1 from public.frequency_listen_acks where match_id=requested_match_id and round_index=requested_round_index and user_id=requested_user_id) then
    raise exception using errcode = 'P0001', message = 'QD_ROUND_ANSWER_NOT_OPEN';
  end if;
  if current_time < round_row.reveal_ends_at then
    raise exception using errcode = 'P0001', message = 'QD_ROUND_ANSWER_NOT_OPEN';
  end if;
  if current_time > round_row.answer_ends_at then
    raise exception using errcode = 'P0001', message = 'QD_ROUND_CLOSED';
  end if;

  select mrs.answer_json into existing_answer
  from public.match_round_submissions mrs
  where mrs.match_id = requested_match_id
    and mrs.round_index = requested_round_index
    and mrs.user_id = requested_user_id;
  if found then
    if existing_answer = submitted_answer then return; end if;
    raise exception using errcode = 'P0001', message = 'QD_DUPLICATE_ROUND_SUBMISSION';
  end if;

  insert into public.match_round_submissions (
    match_id, round_index, user_id, answer_json, feedback_json,
    score, timed_out, submitted_at
  ) values (
    requested_match_id, requested_round_index, requested_user_id,
    submitted_answer, calculated_feedback, calculated_score, false, current_time
  );

  select count(*) into submission_count
  from public.match_round_submissions mrs
  where mrs.match_id = requested_match_id
    and mrs.round_index = requested_round_index;
  if submission_count = 2 then
    update public.match_rounds
    set
      resolved_at = current_time,
      feedback_ends_at = current_time + interval '2 seconds'
    where match_id = requested_match_id
      and round_index = requested_round_index
      and resolved_at is null;
  end if;
end;
$function$;


REVOKE ALL ON FUNCTION public.game_answer_duration(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.game_answer_duration(text) TO service_role;
REVOKE ALL ON FUNCTION public.advance_recall_round(uuid, uuid, smallint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_recall_round(uuid, uuid, smallint, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.submit_recall_round(uuid,uuid,smallint,jsonb,jsonb,numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_recall_round(uuid,uuid,smallint,jsonb,jsonb,numeric) TO service_role;
COMMIT;
