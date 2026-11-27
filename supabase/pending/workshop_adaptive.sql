-- Candidate only. Apply after isolated validation of frequency_round_timing.sql.
begin;
alter table public.private_duels add column workshop_rules jsonb;
alter table public.matches add column match_rules jsonb;

-- Only the authenticated host can create a workshop. The wrapper calls the existing
-- auth/rate-limit/profile gates; settings are persisted before the room code is returned.
create or replace function public.create_private_duel_workshop(requested_selection_kind text,requested_game text,requested_playlist text,requested_best_of smallint,requested_ranked boolean,requested_rules jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; m jsonb; g integer; n integer; r integer; a integer; ordered boolean;
begin
 if auth.uid() is null or requested_ranked is distinct from false or requested_selection_kind is distinct from 'game'
 or requested_game is null or requested_game not in ('memory_grid','shape_recall','dot_estimate','number_order','odd_one_out','pattern_complete','typing_sprint','rhythm_recall','frequency_recall_v2','colour_recall_v2')
 or jsonb_typeof(requested_rules) is distinct from 'object' or requested_rules->>'version' is distinct from '1'
 or requested_rules - array['version','answerMs','revealMs','memory','roundAnswerMs'] <> '{}'::jsonb
 or jsonb_typeof(requested_rules->'answerMs') is distinct from 'number' or jsonb_typeof(requested_rules->'revealMs') is distinct from 'number'
 or requested_rules->>'answerMs' !~ '^[0-9]{1,5}$' or requested_rules->>'revealMs' !~ '^[0-9]{1,5}$'
 then raise exception 'Invalid workshop rules'; end if;
 r:=(requested_rules->>'revealMs')::integer; a:=(requested_rules->>'answerMs')::integer;
 if a not between 3000 and 60000 or r not between 0 and 13000
 or (requested_game in ('memory_grid','shape_recall','dot_estimate') and r not between 500 and 10000)
 or (requested_game not in ('memory_grid','shape_recall','dot_estimate','rhythm_recall') and r<>0)
 or (requested_game='rhythm_recall' and (r<>13000 or a<10000))
 then raise exception 'Invalid workshop timing'; end if;
 if requested_game in ('frequency_recall_v2','colour_recall_v2') then
  if jsonb_typeof(requested_rules->'roundAnswerMs') is distinct from 'number' or requested_rules->>'roundAnswerMs' !~ '^[0-9]{4}$' then raise exception 'Invalid round timing'; end if;
  if (requested_rules->>'roundAnswerMs')::integer not between 3000 and (case when requested_game='frequency_recall_v2' then 6000 else 5200 end) or a<>(case when requested_game='frequency_recall_v2' then 60000 else 40000 end) then raise exception 'Invalid round timing'; end if;
 elsif requested_rules ? 'roundAnswerMs' then raise exception 'Round timing is only for secure recall'; end if;
 if requested_game='memory_grid' then
  m:=requested_rules->'memory';
  if jsonb_typeof(m) is distinct from 'object' or m-array['size','tiles','ordered']<>'{}'::jsonb
  or jsonb_typeof(m->'size') is distinct from 'number' or jsonb_typeof(m->'tiles') is distinct from 'number'
  or m->>'size' !~ '^[0-9]$' or m->>'tiles' !~ '^[0-9]{1,2}$'
  or jsonb_typeof(m->'ordered') is distinct from 'boolean' then raise exception 'Invalid memory rules'; end if;
  g:=(m->>'size')::integer;n:=(m->>'tiles')::integer;ordered:=(m->>'ordered')::boolean;
  if g not between 3 and 8 or n not between 1 and 32 or n>=g*g or (ordered and r<n*250) then raise exception 'Invalid grid or sequence'; end if;
 elsif requested_rules ? 'memory' then raise exception 'Memory rules are only for memory'; end if;
 result:=public.create_private_duel(requested_selection_kind,requested_game,requested_playlist,requested_best_of,false);
 update public.private_duels set workshop_rules=requested_rules where code=result->>'code' and host_id=auth.uid() and state='waiting';
 if not found then raise exception 'Unable to persist rules';end if;
 return result;
end;
$$;
revoke all on function public.create_private_duel_workshop(text,text,text,smallint,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.create_private_duel_workshop(text,text,text,smallint,boolean,jsonb) to authenticated;

-- Match creation copies immutable workshop rules from the room. Adapt only at the
-- first authoritative start, when both players exist. Use lower rating bracket.
create or replace function public.apply_match_rules() returns trigger
language plpgsql security definer set search_path='' as $$
declare config jsonb; tier text; player_count integer; placed_count integer; minimum_rating integer; r integer; a integer;
begin
 if TG_OP='INSERT' then
  if NEW.private_duel_id is not null then
   select workshop_rules into config from public.private_duels where id=NEW.private_duel_id;
   if config is not null then
    NEW.ranked:=false;NEW.match_rules:=jsonb_build_object('kind','workshop','version',1,'rules',config);
    NEW.reveal_duration_ms:=(config->>'revealMs')::integer;NEW.answer_duration_ms:=(config->>'answerMs')::integer;
    if NEW.game_type='memory_grid' then NEW.grid_size:=(config->'memory'->>'size')::smallint;NEW.highlight_count:=(config->'memory'->>'tiles')::smallint;end if;
   end if;
  end if;
  return NEW;
 end if;
 if OLD.starts_at is not null or NEW.starts_at is null then return NEW;end if;
 if NEW.match_rules->>'kind'='workshop' then
  NEW.expires_at:=NEW.starts_at+make_interval(secs=>(NEW.reveal_duration_ms+NEW.answer_duration_ms+5000)::double precision/1000);return NEW;
 end if;
 if not NEW.ranked or NEW.source<>'public_queue' or NEW.game_type not in ('memory_grid','shape_recall','dot_estimate','number_order','odd_one_out','pattern_complete','typing_sprint') then return NEW;end if;
 select count(*),count(*) filter(where p.matches_played>=5),min(mp.rating_before) into player_count,placed_count,minimum_rating
 from public.match_players mp join public.profiles p on p.id=mp.user_id where mp.match_id=NEW.id;
 tier:=case when player_count<>2 or placed_count<>2 then 'standard' when minimum_rating<1000 then 'beginner' when minimum_rating<1200 then 'standard' when minimum_rating<1600 then 'advanced' else 'elite' end;
 r:=NEW.reveal_duration_ms;a:=NEW.answer_duration_ms;
 case NEW.game_type
 when 'memory_grid' then r:=case tier when 'beginner' then 3500 when 'advanced' then 2000 when 'elite' then 1800 else 2500 end;a:=case tier when 'beginner' then 10000 when 'advanced' then 6000 when 'elite' then 5000 else 7000 end;
 when 'odd_one_out' then a:=case tier when 'beginner' then 9000 when 'advanced' then 5000 when 'elite' then 4000 else 6000 end;
 when 'number_order' then a:=case tier when 'beginner' then 12000 when 'advanced' then 7000 when 'elite' then 6000 else 8000 end;
 when 'pattern_complete' then a:=case tier when 'beginner' then 28000 when 'advanced' then 16000 when 'elite' then 14000 else 18000 end;
 when 'dot_estimate' then r:=case tier when 'beginner' then 3300 when 'advanced' then 1800 when 'elite' then 1400 else 2200 end;a:=case tier when 'beginner' then 10000 when 'advanced' then 6000 when 'elite' then 5000 else 7000 end;
 when 'shape_recall' then r:=case tier when 'beginner' then 4000 when 'advanced' then 2200 when 'elite' then 1800 else 2600 end;a:=case tier when 'beginner' then 20000 when 'advanced' then 12000 when 'elite' then 10000 else 14000 end;
 when 'typing_sprint' then a:=30000;
 else null;
 end case;
 NEW.match_rules:=jsonb_build_object('kind','adaptive','version',1,'tier',tier);NEW.reveal_duration_ms:=r;NEW.answer_duration_ms:=a;
 NEW.expires_at:=NEW.starts_at+make_interval(secs=>(r+a+5000)::double precision/1000);
 return NEW;
end;
$$;
revoke all on function public.apply_match_rules() from public,anon,authenticated;
create trigger qd_workshop_insert before insert on public.matches for each row execute function public.apply_match_rules();
create trigger qd_rank_timing_start before update of starts_at on public.matches for each row execute function public.apply_match_rules();
commit;
