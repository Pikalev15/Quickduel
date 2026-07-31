begin;

create or replace function public.game_reveal_duration(requested_game text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case requested_game
    when 'memory_grid' then 2950
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

revoke all on function public.game_reveal_duration(text)
  from public, anon, authenticated;

commit;
