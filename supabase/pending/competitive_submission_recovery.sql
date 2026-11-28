begin;

-- Timeout receipts are presence hints, not scored answers. Identical retries are
-- idempotent, conflicting duplicates remain rejected, and an expired RPC must
-- never report success for an answer that was not stored.
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
  existing_player public.match_players;
  answer_started_at timestamptz;
  elapsed_ms integer;
begin
  if submitted_payload is null or calculated_result is null
    or pg_column_size(submitted_payload) > 16384
    or pg_column_size(calculated_result) > 16384 then
    raise exception using
      errcode = 'P0001',
      message = 'Game submission is invalid.',
      detail = 'QD_INVALID_SUBMISSION';
  end if;

  select * into match_row
  from public.matches
  where id = requested_match_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'QD_MATCH_NOT_FOUND';
  end if;

  select * into existing_player
  from public.match_players
  where match_id = requested_match_id and user_id = requested_user_id
  for update;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Match was not found.',
      detail = 'QD_MATCH_NOT_FOUND';
  end if;

  if coalesce(submitted_payload ->> 'timedOut', '') = 'true' then
    return;
  end if;

  if existing_player.submitted_at is not null then
    if existing_player.submission_json = submitted_payload
      and existing_player.result_json = calculated_result then
      return;
    end if;
    raise exception using
      errcode = 'P0001',
      message = 'Answer already submitted.',
      detail = 'QD_DUPLICATE_SUBMISSION';
  end if;

  if match_row.status in ('completed', 'abandoned', 'cancelled') then
    raise exception using
      errcode = 'P0001',
      message = 'Match is no longer active.',
      detail = 'QD_MATCH_TERMINAL';
  end if;

  answer_started_at := match_row.starts_at
    + make_interval(secs => match_row.reveal_duration_ms::double precision / 1000);
  if answer_started_at is null or clock_timestamp() < answer_started_at then
    raise exception using
      errcode = 'P0001',
      message = 'Answer phase has not started.',
      detail = 'QD_ANSWER_NOT_OPEN';
  end if;
  if clock_timestamp() > answer_started_at
    + make_interval(secs => (
      match_row.answer_duration_ms
      + public.ranked_forfeit_grace_seconds() * 1000
    )::double precision / 1000) then
    raise exception using
      errcode = 'P0001',
      message = 'The answer window has closed.',
      detail = 'QD_ANSWER_EXPIRED';
  end if;

  elapsed_ms := least(match_row.answer_duration_ms, greatest(
    0,
    round(extract(epoch from (clock_timestamp() - answer_started_at)) * 1000)
  ));
  update public.match_players
  set
    submitted_at = clock_timestamp(),
    submission_json = submitted_payload,
    result_json = calculated_result,
    calculated_score = calculated_rank_score,
    correct_count = calculated_correct,
    incorrect_count = calculated_incorrect,
    completion_time_ms = elapsed_ms,
    selected_cells = '{}'::smallint[]
  where match_id = requested_match_id
    and user_id = requested_user_id
    and submitted_at is null;
  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'Answer already submitted.',
      detail = 'QD_DUPLICATE_SUBMISSION';
  end if;

  update public.matches
  set status = 'active'
  where id = requested_match_id and status = 'countdown';
  perform public.finalize_match_outcome_locked(requested_match_id, false);
end;
$$;

revoke all on function public.submit_game_result(uuid, uuid, jsonb, jsonb, numeric, smallint, smallint)
  from public, anon, authenticated;
grant execute on function public.submit_game_result(uuid, uuid, jsonb, jsonb, numeric, smallint, smallint)
  to service_role;

-- Five default Frequency rounds need 5 × (4s reveal + 8.2s answer + 2s feedback)
-- = 71s. The existing five-second grace remains transport/expiry slack.
create or replace function public.game_answer_duration(requested_game text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $function$
  select case requested_game
    when 'memory_grid' then 7000
    when 'frequency_recall' then 12000
    when 'frequency_recall_v2' then 71000
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
revoke all on function public.game_answer_duration(text) from public, anon, authenticated;
grant execute on function public.game_answer_duration(text) to service_role;

commit;
