-- Run only after the prepared app is serving production and old clients have drained.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.matches in share row exclusive mode;
do $cutover$
begin
  if (public.get_workshop_release_status()->>'prepared') is distinct from 'true' then
    raise exception 'Workshop schema expansion is incomplete';
  end if;
  if exists(select 1 from public.matches where status in ('waiting','countdown','active')) then
    raise exception 'Active matches must drain before cutover';
  end if;
end;
$cutover$;

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
revoke all on function public.game_answer_duration(text) from public, anon, authenticated;
grant execute on function public.game_answer_duration(text) to service_role;

revoke all on function public.join_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.heartbeat_matchmaking(text, text) from public, anon, authenticated;
revoke all on function public.create_private_duel(text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.create_private_duel_workshop(text, text, text, smallint, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.join_private_duel(text) from public, anon, authenticated;
revoke all on function public.send_duel_invitation(text, text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.respond_duel_invitation(uuid, boolean) from public, anon, authenticated;

update public.workshop_release_control set activated=true where singleton;
commit;
