begin;

create table public.match_rounds (
  match_id uuid not null references public.matches(id) on delete cascade,
  round_index smallint not null check (round_index between 0 and 4),
  target_json jsonb not null,
  started_at timestamptz not null,
  reveal_ends_at timestamptz not null,
  answer_ends_at timestamptz not null,
  resolved_at timestamptz,
  feedback_ends_at timestamptz,
  primary key (match_id, round_index),
  constraint match_round_timing_order check (
    started_at < reveal_ends_at
    and reveal_ends_at < answer_ends_at
    and (
      resolved_at is null
      or (
        resolved_at >= started_at
        and feedback_ends_at is not null
        and feedback_ends_at = resolved_at + interval '2 seconds'
      )
    )
  )
);

create table public.match_round_submissions (
  match_id uuid not null,
  round_index smallint not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer_json jsonb not null,
  feedback_json jsonb not null,
  score numeric(6,3) not null check (score between 0 and 10),
  timed_out boolean not null default false,
  submitted_at timestamptz not null,
  primary key (match_id, round_index, user_id),
  foreign key (match_id, round_index)
    references public.match_rounds(match_id, round_index) on delete cascade
);

create index match_rounds_unresolved_idx
  on public.match_rounds (answer_ends_at)
  where resolved_at is null;

create index match_round_submissions_player_idx
  on public.match_round_submissions (match_id, user_id, round_index);

alter table public.match_rounds enable row level security;
alter table public.match_round_submissions enable row level security;

revoke all on public.match_rounds from public, anon, authenticated;
revoke all on public.match_round_submissions from public, anon, authenticated;

-- Service-only state transition. Targets are inserted one at a time and this
-- function returns only the current reveal/resolved target to one participant.
create or replace function public.advance_recall_round(
  requested_match_id uuid,
  requested_user_id uuid,
  requested_target_round_index smallint,
  requested_target jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
$$;

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
as $$
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
$$;

-- Completed, explicitly shared matches may expose the final summary metrics,
-- but never the private round tables or targets directly.
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
        then mp.result_json -> 'details'
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

revoke all on function public.advance_recall_round(uuid, uuid, smallint, jsonb)
  from public, anon, authenticated;
revoke all on function public.submit_recall_round(
  uuid, uuid, smallint, jsonb, jsonb, numeric
) from public, anon, authenticated;
revoke all on function public.get_public_match_share(text)
  from public, anon, authenticated;
grant execute on function public.advance_recall_round(uuid, uuid, smallint, jsonb)
  to service_role;
grant execute on function public.submit_recall_round(
  uuid, uuid, smallint, jsonb, jsonb, numeric
) to service_role;
grant execute on function public.get_public_match_share(text)
  to anon, authenticated;

comment on table public.match_rounds is
  'Private authoritative per-round lifecycle. Targets are service-only.';
comment on table public.match_round_submissions is
  'Immutable participant answers and server-calculated recall feedback.';

commit;
