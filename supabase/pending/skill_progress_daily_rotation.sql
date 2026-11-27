-- Apply only after workshop_adaptive.sql and daily_duel.sql on an isolated database.
begin;
alter table public.daily_duel_challenges drop constraint daily_duel_challenges_game_version_check;
alter table public.daily_duel_challenges add constraint daily_duel_challenges_game_version_check check(game_version in (1,2));
alter table public.daily_duel_challenges alter column game_version set default 2;

create or replace function public.get_daily_weekly_board(requested_date date)
returns jsonb language sql stable security invoker set search_path='' as $$
 with period as (select date_trunc('week',requested_date::timestamp)::date as week),
 totals as (
 select p.id,p.display_name as name,sum(a.score)::integer as score,count(*)::integer as days
 from public.daily_duel_attempts a join public.profiles p on p.id=a.user_id cross join period w
 where a.challenge_date>=w.week and a.challenge_date<w.week+7 and a.completed_at is not null
 and p.deleted_at is null and p.account_state='normal' group by p.id,p.display_name
 ), board as (select rank() over(order by score desc) as rank,name,score,days from totals order by score desc,name limit 100)
 select jsonb_build_object('week',(select week from period),'leaderboard',coalesce((select jsonb_agg(to_jsonb(board) order by rank,name) from board),'[]'::jsonb));
$$;
revoke all on function public.get_daily_weekly_board(date) from public,anon,authenticated;
grant execute on function public.get_daily_weekly_board(date) to service_role;

-- Read only the caller's real ranked matches; each persisted timing is independent.
create or replace function public.get_my_skill_progress()
returns jsonb language sql stable security definer set search_path='' as $$
 with played as (
 select m.id,m.game_type as game,m.game_version as version,coalesce(m.match_rules->>'tier','legacy') as tier,
 m.reveal_duration_ms as "revealMs",m.answer_duration_ms as "answerMs",mp.result_json->>'summary' as summary,
 (mp.result_json->>'rankScore')::numeric as score,(mp.result_json->>'accuracy')::numeric as accuracy,mp.completion_time_ms,m.completed_at
 from public.match_players mp join public.matches m on m.id=mp.match_id
 where mp.user_id=auth.uid() and m.ranked and m.source='public_queue' and m.status='completed' and m.invalidated_at is null and m.completion_reason='normal'
 and jsonb_typeof(mp.result_json->'accuracy')='number' and jsonb_typeof(mp.result_json->'rankScore')='number'
 and (mp.result_json->>'rankScore')::numeric > -999999
 ), numbered as (
 select *,row_number() over(partition by game,version,tier,"revealMs","answerMs" order by completed_at desc,id) as recent,
 row_number() over(partition by game,version,tier,"revealMs","answerMs" order by score desc,accuracy desc,completion_time_ms,completed_at,id) as best from played
 ), grouped as (
 select game,version,tier,"revealMs","answerMs",count(*) as attempts,count(*) filter(where recent<=10) as "recentCount",
 avg(accuracy) filter(where recent<=10) as accuracy,max(score) filter(where best=1) as "bestScore",
 max(summary) filter(where best=1) as "bestSummary",max(id::text) filter(where best=1) as "bestMatchId"
 from numbered group by game,version,tier,"revealMs","answerMs"
 )
 select coalesce(jsonb_agg(to_jsonb(grouped) order by game,tier),'[]'::jsonb) from grouped;
$$;
revoke all on function public.get_my_skill_progress() from public,anon,authenticated;
grant execute on function public.get_my_skill_progress() to authenticated;

insert into public.cosmetics(id,cosmetic_type,name,configuration,free) values
 ('frame-precision','profile_frame','Precision frame','{"style":"precision"}',false)
 on conflict(id) do nothing;

create or replace function public.claim_skill_rewards()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 perform public.check_rate_limit('skill_rewards',10,60);
 if exists (
 select 1 from public.match_players mp join public.matches m on m.id=mp.match_id
 join public.profiles p on p.id=mp.user_id
 where mp.user_id=auth.uid() and p.deleted_at is null and p.account_state='normal'
 and m.ranked and m.source='public_queue' and m.status='completed' and m.invalidated_at is null and m.completion_reason='normal'
 and jsonb_typeof(mp.result_json->'accuracy')='number' and (mp.result_json->>'accuracy')::numeric>=.85
 group by m.game_type,m.game_version,m.reveal_duration_ms,m.answer_duration_ms having count(*)>=5
 ) then
  insert into public.user_cosmetics(user_id,cosmetic_id,granted_by) values(auth.uid(),'frame-precision','achievement') on conflict do nothing;
 end if;
 return public.get_cosmetics();
end;
$$;
revoke all on function public.claim_skill_rewards() from public,anon,authenticated;
grant execute on function public.claim_skill_rewards() to authenticated;

create or replace function public.get_friends_state()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  friends_json jsonb;
  requests_json jsonb;
  invitations_json jsonb;
  blocks_json jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.touch_presence();
  select coalesce(jsonb_agg(jsonb_build_object(
    'display_name', p.display_name,
    'public_code', p.public_code,
    'rating', p.rating,
    'status', case
      when p.last_active_at > now() - interval '2 minutes' then 'online'
      when p.last_active_at > now() - interval '24 hours' then 'recent'
      else 'offline'
    end,
    'per_game', (
      select coalesce(jsonb_agg(to_jsonb(g) order by g.game), '[]'::jsonb) from (
        select m.game_type as game,count(*) as matches,count(*) filter(where m.winner_id=auth.uid()) as wins,
          count(*) filter(where m.winner_id=p.id) as losses,count(*) filter(where m.winner_id is null) as draws
        from public.matches m join public.match_players a on a.match_id=m.id and a.user_id=auth.uid()
        join public.match_players b on b.match_id=m.id and b.user_id=p.id
        where m.status='completed' and m.invalidated_at is null and m.completion_reason='normal'
        group by m.game_type
      ) g
    ),
    'head_to_head', (
      select jsonb_build_object(
        'matches', count(*),
        'wins', count(*) filter (where m.winner_id = auth.uid()),
        'losses', count(*) filter (where m.winner_id = p.id),
        'draws', count(*) filter (where m.winner_id is null)
      )
      from public.matches m
      where m.status = 'completed'
        and exists (
          select 1 from public.match_players a
          where a.match_id = m.id and a.user_id = auth.uid()
        )
        and exists (
          select 1 from public.match_players b
          where b.match_id = m.id and b.user_id = p.id
        )
    )
  ) order by p.last_active_at desc), '[]'::jsonb)
  into friends_json
  from public.friends f
  join public.profiles p
    on p.id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
  where auth.uid() in (f.user_low, f.user_high);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', fr.id,
    'direction', case when fr.recipient_id = auth.uid() then 'incoming' else 'outgoing' end,
    'display_name', p.display_name,
    'public_code', p.public_code,
    'created_at', fr.created_at
  ) order by fr.created_at desc), '[]'::jsonb)
  into requests_json
  from public.friend_requests fr
  join public.profiles p
    on p.id = case when fr.recipient_id = auth.uid() then fr.requester_id else fr.recipient_id end
  where fr.status = 'pending'
    and auth.uid() in (fr.requester_id, fr.recipient_id);

  update public.duel_invitations
  set status = 'expired'
  where status = 'pending' and expires_at <= now();
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', di.id,
    'direction', case when di.recipient_id = auth.uid() then 'incoming' else 'outgoing' end,
    'display_name', p.display_name,
    'public_code', p.public_code,
    'duel_code', d.code,
    'game_type', d.game_type,
    'playlist', d.playlist,
    'best_of', d.best_of,
    'ranked', d.ranked,
    'created_at', di.created_at,
    'expires_at', di.expires_at
  ) order by di.created_at desc), '[]'::jsonb)
  into invitations_json
  from public.duel_invitations di
  join public.private_duels d on d.id = di.private_duel_id
  join public.profiles p
    on p.id = case when di.recipient_id = auth.uid() then di.sender_id else di.recipient_id end
  where di.status = 'pending'
    and auth.uid() in (di.sender_id, di.recipient_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'display_name', p.display_name,
    'public_code', p.public_code
  ) order by ub.created_at desc), '[]'::jsonb)
  into blocks_json
  from public.user_blocks ub
  join public.profiles p on p.id = ub.blocked_id
  where ub.blocker_id = auth.uid();

  return jsonb_build_object(
    'friends', friends_json,
    'requests', requests_json,
    'invitations', invitations_json,
    'blocked', blocks_json
  );
end;
$$;
commit;
