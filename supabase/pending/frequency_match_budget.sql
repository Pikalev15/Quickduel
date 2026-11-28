begin;

-- Apply only after release cutover. Five default Frequency rounds need
-- 5 × (4s reveal + 8.2s answer + 2s feedback) = 71s. The existing five-second
-- grace remains transport/expiry slack.
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
