-- Isolated preview migration candidate. Never apply to live data before testing.
begin;
create table public.daily_duel_challenges (
 challenge_date date primary key,
 seed text not null default pg_catalog.gen_random_uuid()::text,
 game_version integer not null default 1 check(game_version=1)
);
create table public.daily_duel_attempts (
 challenge_date date not null references public.daily_duel_challenges(challenge_date) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 started_at timestamptz not null default clock_timestamp(),
 deadline timestamptz not null default (clock_timestamp()+interval '45 seconds'),
 completed_at timestamptz,
 score integer check(score between 0 and 6),
 primary key(challenge_date,user_id),
 check(deadline>started_at),
 check((completed_at is null)=(score is null))
);
create index daily_duel_scores on public.daily_duel_attempts(challenge_date,score desc) where completed_at is not null;
alter table public.daily_duel_challenges enable row level security;
alter table public.daily_duel_attempts enable row level security;
revoke all on public.daily_duel_challenges,public.daily_duel_attempts from public,anon,authenticated;
grant select,insert,update on public.daily_duel_challenges,public.daily_duel_attempts to service_role;
create or replace function public.finish_daily_duel(requested_date date,requested_user uuid,calculated_score integer)
returns integer language plpgsql volatile security invoker set search_path='' as $$
declare final_score integer;
begin
 if calculated_score is null or calculated_score not between 0 and 6 then raise exception 'Invalid score'; end if;
 update public.daily_duel_attempts
 set score=calculated_score,completed_at=clock_timestamp()
 where challenge_date=requested_date and user_id=requested_user and completed_at is null
   and clock_timestamp()<=deadline+interval '1 second'
 returning score into final_score;
 if found then return final_score; end if;
 select score into final_score from public.daily_duel_attempts where challenge_date=requested_date and user_id=requested_user;
 return final_score;
end;
$$;
revoke all on function public.finish_daily_duel(date,uuid,integer) from public,anon,authenticated;
grant execute on function public.finish_daily_duel(date,uuid,integer) to service_role;
commit;
