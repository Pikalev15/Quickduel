begin;

-- Retention, social, progression, safety, and operations layer.
-- Existing matches/match_players remain the authoritative match record.

alter table public.profiles drop constraint if exists profiles_display_name_key;

alter table public.profiles
  add column public_code text,
  add column last_active_at timestamptz not null default now(),
  add column deleted_at timestamptz,
  add column account_state text not null default 'normal'
    check (account_state in (
      'normal', 'warning', 'ranked_restricted', 'temporarily_suspended',
      'manually_banned', 'deleted'
    ));

create or replace function public.allocate_public_code(requested_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  attempt integer := 0;
  candidate text;
begin
  loop
    candidate := upper(substr(
      encode(extensions.digest(requested_user_id::text || ':' || attempt::text, 'sha256'), 'hex'),
      1,
      6
    ));
    exit when not exists (
      select 1 from public.profiles where public_code = candidate
    );
    attempt := attempt + 1;
  end loop;
  return candidate;
end;
$$;

do $$
declare
  profile_row record;
begin
  for profile_row in select id from public.profiles where public_code is null loop
    update public.profiles
    set public_code = public.allocate_public_code(profile_row.id)
    where id = profile_row.id;
  end loop;
end;
$$;

alter table public.profiles
  alter column public_code set not null,
  add constraint profiles_public_code_key unique (public_code),
  add constraint profiles_public_code_format
    check (public_code ~ '^[A-F0-9]{6}$');

create index profiles_display_name_search_idx
  on public.profiles (lower(display_name))
  where deleted_at is null;
create index profiles_presence_idx
  on public.profiles (last_active_at desc)
  where deleted_at is null;

create or replace function public.set_profile_public_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.public_code is null then
    new.public_code := public.allocate_public_code(new.id);
  end if;
  return new;
end;
$$;

create trigger profiles_assign_public_code
before insert on public.profiles
for each row execute function public.set_profile_public_code();

create table public.user_progression (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  highest_rating integer not null default 1000 check (highest_rating between 100 and 4000),
  current_win_streak integer not null default 0 check (current_win_streak >= 0),
  best_win_streak integer not null default 0 check (best_win_streak >= 0),
  onboarding_completed_at timestamptz,
  onboarding_skipped boolean not null default false,
  recommended_playlist text
    check (recommended_playlist is null or recommended_playlist in ('quick', 'sensory', 'mind')),
  updated_at timestamptz not null default now()
);

insert into public.user_progression (user_id, highest_rating, onboarding_completed_at)
select id, rating, now() from public.profiles
on conflict (user_id) do nothing;

create or replace function public.ensure_progression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_progression (user_id, highest_rating)
  values (new.id, new.rating)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger profiles_create_progression
after insert on public.profiles
for each row execute function public.ensure_progression();

alter table public.game_stats
  add column total_rank_score numeric(20,6) not null default 0,
  add column total_time_ms bigint not null default 0,
  add column recent_results jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recent_results) = 'array');

create table public.private_duels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  host_id uuid not null references public.profiles(id),
  guest_id uuid references public.profiles(id),
  selection_kind text not null check (selection_kind in ('game', 'playlist')),
  game_type text,
  playlist text not null default 'quick'
    check (playlist in ('quick', 'sensory', 'mind', 'experimental')),
  best_of smallint not null default 1 check (best_of in (1, 3, 5)),
  ranked boolean not null default false,
  state text not null default 'waiting'
    check (state in ('waiting', 'ready', 'active', 'completed', 'expired', 'cancelled')),
  host_score smallint not null default 0 check (host_score >= 0),
  guest_score smallint not null default 0 check (guest_score >= 0),
  current_round smallint not null default 0 check (current_round between 0 and 25),
  current_match_id uuid,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint private_duel_participants_differ
    check (guest_id is null or guest_id <> host_id),
  constraint private_duel_selection_valid check (
    (selection_kind = 'game' and game_type is not null)
    or (selection_kind = 'playlist' and game_type is null)
  )
);

alter table public.matches
  add column source text not null default 'public_queue'
    check (source in ('public_queue', 'private_duel')),
  add column playlist text,
  add column private_duel_id uuid references public.private_duels(id),
  add column series_round smallint,
  add column invalidated_at timestamptz,
  add column share_code text unique,
  add column share_enabled boolean not null default false;

alter table public.private_duels
  add constraint private_duels_current_match_fkey
  foreign key (current_match_id) references public.matches(id);

create index matches_participant_history_idx
  on public.matches (completed_at desc, id desc)
  where status = 'completed';
create index matches_private_duel_idx
  on public.matches (private_duel_id, series_round)
  where private_duel_id is not null;
create index matches_share_code_idx
  on public.matches (share_code)
  where share_enabled and share_code is not null;
create index private_duels_code_idx on public.private_duels (code);
create index private_duels_host_active_idx
  on public.private_duels (host_id, created_at desc)
  where state in ('waiting', 'ready', 'active');
create index private_duels_guest_active_idx
  on public.private_duels (guest_id, created_at desc)
  where state in ('ready', 'active');

create table public.season_definitions (
  id text primary key,
  starts_at timestamptz not null unique,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint season_duration check (ends_at = starts_at + interval '7 days')
);

create table public.season_player_stats (
  season_id text not null references public.season_definitions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  matches_counted integer not null default 0 check (matches_counted >= 0),
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id)
);

create table public.season_pair_daily_counts (
  season_id text not null references public.season_definitions(id) on delete cascade,
  player_low uuid not null references public.profiles(id) on delete cascade,
  player_high uuid not null references public.profiles(id) on delete cascade,
  match_day date not null,
  matches_counted smallint not null default 0 check (matches_counted between 0 and 3),
  primary key (season_id, player_low, player_high, match_day),
  check (player_low <> player_high)
);

create index season_leaderboard_idx
  on public.season_player_stats (season_id, points desc, wins desc, updated_at asc);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> recipient_id)
);

create unique index friend_requests_pending_pair_idx
  on public.friend_requests (
    least(requester_id::text, recipient_id::text),
    greatest(requester_id::text, recipient_id::text)
  )
  where status = 'pending';
create index friend_requests_recipient_idx
  on public.friend_requests (recipient_id, created_at desc)
  where status = 'pending';

create table public.friends (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low::text < user_high::text)
);

create index friends_high_lookup_idx on public.friends (user_high, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

create table public.duel_invitations (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  private_duel_id uuid not null references public.private_duels(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  responded_at timestamptz,
  check (sender_id <> recipient_id)
);

create unique index duel_invitations_active_pair_idx
  on public.duel_invitations (sender_id, recipient_id)
  where status = 'pending';
create index duel_invitations_recipient_idx
  on public.duel_invitations (recipient_id, created_at desc)
  where status = 'pending';

create table public.analytics_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  user_id uuid references public.profiles(id) on delete set null,
  session_id uuid,
  game_type text,
  playlist text,
  match_id uuid references public.matches(id) on delete set null,
  device_class text check (device_class is null or device_class in ('mobile', 'tablet', 'desktop')),
  referrer_category text,
  experiment_variant text,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(properties) = 'object' and pg_column_size(properties) <= 4096),
  occurred_at timestamptz not null default now()
);

create index analytics_events_time_idx on public.analytics_events (occurred_at desc);
create index analytics_events_type_time_idx
  on public.analytics_events (event_type, occurred_at desc);
create index analytics_events_user_time_idx
  on public.analytics_events (user_id, occurred_at desc)
  where user_id is not null;

create table public.rate_limit_buckets (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (actor_id, action, window_started_at)
);

create index rate_limit_cleanup_idx on public.rate_limit_buckets (window_started_at);

create table public.abuse_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  match_id uuid references public.matches(id) on delete set null,
  signal text not null,
  severity smallint not null default 1 check (severity between 1 and 5),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object' and pg_column_size(evidence) <= 8192),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create index abuse_flags_status_idx on public.abuse_flags (status, created_at desc);
create index abuse_flags_user_idx on public.abuse_flags (user_id, created_at desc);

create table public.account_enforcement (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state text not null default 'normal'
    check (state in (
      'normal', 'warning', 'ranked_restricted', 'temporarily_suspended',
      'manually_banned'
    )),
  reason text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table public.admin_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator', 'analyst')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_match_id uuid references public.matches(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192),
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create index audit_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_target_idx on public.audit_log (target_user_id, created_at desc);
create index audit_match_idx on public.audit_log (target_match_id, created_at desc);

create table public.cosmetics (
  id text primary key,
  cosmetic_type text not null check (cosmetic_type in (
    'profile_accent', 'profile_frame', 'result_card_theme',
    'victory_effect', 'division_badge_style'
  )),
  name text not null,
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  free boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.user_cosmetics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_id text not null references public.cosmetics(id),
  granted_by text not null default 'free'
    check (granted_by in ('free', 'achievement', 'season', 'admin', 'future_purchase')),
  granted_at timestamptz not null default now(),
  primary key (user_id, cosmetic_id)
);

create table public.equipped_cosmetics (
  user_id uuid not null references public.profiles(id) on delete cascade,
  cosmetic_type text not null check (cosmetic_type in (
    'profile_accent', 'profile_frame', 'result_card_theme',
    'victory_effect', 'division_badge_style'
  )),
  cosmetic_id text not null references public.cosmetics(id),
  updated_at timestamptz not null default now(),
  primary key (user_id, cosmetic_type)
);

insert into public.cosmetics (id, cosmetic_type, name, configuration, free)
values
  ('accent-volt', 'profile_accent', 'Volt', '{"colour":"#3157d5"}', true),
  ('accent-cyan', 'profile_accent', 'Cyan', '{"colour":"#1488a8"}', true),
  ('accent-coral', 'profile_accent', 'Coral', '{"colour":"#d05d4d"}', true),
  ('frame-clean', 'profile_frame', 'Clean frame', '{"style":"clean"}', true),
  ('card-classic', 'result_card_theme', 'Classic result', '{"style":"classic"}', true),
  ('badge-classic', 'division_badge_style', 'Classic divisions', '{"style":"classic"}', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Shared authorization, rate limiting, profile, and presence functions
-- ---------------------------------------------------------------------------

create or replace function public.is_admin(requested_roles text[] default array['admin', 'moderator'])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role = any(requested_roles)
  );
$$;

create or replace function public.check_rate_limit(
  requested_action text,
  requested_limit integer,
  requested_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  bucket_start timestamptz;
  current_count integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if requested_limit < 1 or requested_window_seconds < 1 then
    raise exception 'Invalid rate limit';
  end if;
  bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / requested_window_seconds)
    * requested_window_seconds
  );
  insert into public.rate_limit_buckets (
    actor_id, action, window_started_at, request_count
  )
  values (caller_id, requested_action, bucket_start, 1)
  on conflict (actor_id, action, window_started_at)
  do update set request_count = public.rate_limit_buckets.request_count + 1
  returning request_count into current_count;
  if current_count > requested_limit then
    raise exception 'Rate limit exceeded';
  end if;
  return true;
end;
$$;

create or replace function public.touch_presence()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.profiles
  set last_active_at = greatest(last_active_at, now())
  where id = auth.uid() and deleted_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_queue_health(
  requested_playlist text default 'quick',
  requested_game text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'waiting_approximately',
    case
      when count(*) = 0 then 0
      when count(*) between 1 and 4 then count(*)
      else (round(count(*)::numeric / 5) * 5)::integer
    end,
    'active_now',
    (
      select count(distinct active.user_id)
      from (
        select q.user_id
        from public.matchmaking_queue q
        where q.expires_at > now()
        union all
        select mp.user_id
        from public.match_players mp
        join public.matches m on m.id = mp.match_id
        where m.status in ('waiting', 'countdown', 'active')
          and m.expires_at > now()
      ) active
    )
  )
  from public.matchmaking_queue q
  where q.expires_at > now()
    and q.playlist = requested_playlist
    and (
      requested_game is null
      or q.preferred_game is null
      or q.preferred_game = requested_game
    );
$$;

create or replace function public.enforce_queue_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  enforcement_state text;
begin
  if auth.uid() is null then return new; end if;
  select state into enforcement_state
  from public.account_enforcement
  where user_id = auth.uid()
    and (expires_at is null or expires_at > now());
  if enforcement_state in ('temporarily_suspended', 'manually_banned') then
    raise exception 'Matchmaking is unavailable for this account';
  end if;
  if enforcement_state = 'ranked_restricted' and new.playlist <> 'experimental' then
    raise exception 'Ranked matchmaking is restricted for this account';
  end if;
  perform public.check_rate_limit('queue_write', 120, 60);
  return new;
end;
$$;

create trigger matchmaking_queue_enforcement
before insert or update on public.matchmaking_queue
for each row execute function public.enforce_queue_access();

create or replace function public.update_profile(
  requested_display_name text,
  requested_accent_colour text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  normalized_name text := btrim(requested_display_name);
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform public.check_rate_limit('profile_update', 6, 3600);
  if normalized_name !~ '^[A-Za-z][A-Za-z0-9 _-]{2,23}$' then
    raise exception 'Name must be 3-24 characters and start with a letter';
  end if;
  if requested_accent_colour not in ('volt', 'cyan', 'coral', 'violet', 'white') then
    raise exception 'Accent colour is invalid';
  end if;
  update public.profiles
  set display_name = normalized_name,
      accent_colour = requested_accent_colour,
      last_active_at = now()
  where id = caller_id and deleted_at is null;
  if not found then raise exception 'Profile is unavailable'; end if;
  return public.get_my_profile();
end;
$$;

create or replace function public.get_my_profile()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  profile_row public.profiles;
  progression_row public.user_progression;
  player_rank integer;
  stats_json jsonb;
  cosmetics_json jsonb;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_profile();
  update public.profiles set last_active_at = now() where id = caller_id;
  select * into profile_row from public.profiles where id = caller_id;
  insert into public.user_progression (user_id, highest_rating)
  values (caller_id, profile_row.rating)
  on conflict (user_id) do nothing;
  select * into progression_row from public.user_progression where user_id = caller_id;
  select 1 + count(*) into player_rank
  from public.profiles
  where rating > profile_row.rating and deleted_at is null;
  select coalesce(
    jsonb_object_agg(game_type, to_jsonb(s) - 'user_id' - 'game_type'),
    '{}'::jsonb
  )
  into stats_json
  from public.game_stats s
  where user_id = caller_id;
  select coalesce(
    jsonb_object_agg(ec.cosmetic_type, ec.cosmetic_id),
    '{}'::jsonb
  )
  into cosmetics_json
  from public.equipped_cosmetics ec
  where ec.user_id = caller_id;
  return jsonb_build_object(
    'id', profile_row.id,
    'display_name', profile_row.display_name,
    'public_code', profile_row.public_code,
    'accent_colour', profile_row.accent_colour,
    'rating', profile_row.rating,
    'wins', profile_row.wins,
    'losses', profile_row.losses,
    'draws', profile_row.draws,
    'matches_played', profile_row.matches_played,
    'rank', player_rank,
    'account_state', profile_row.account_state,
    'highest_rating', progression_row.highest_rating,
    'current_win_streak', progression_row.current_win_streak,
    'best_win_streak', progression_row.best_win_streak,
    'onboarding_completed', progression_row.onboarding_completed_at is not null,
    'onboarding_skipped', progression_row.onboarding_skipped,
    'recommended_playlist', progression_row.recommended_playlist,
    'game_stats', stats_json,
    'equipped_cosmetics', cosmetics_json
  );
end;
$$;

drop function if exists public.get_public_leaderboard(integer);
create function public.get_public_leaderboard(result_limit integer default 100)
returns table (
  rank bigint,
  id text,
  display_name text,
  rating integer,
  wins integer,
  losses integer,
  draws integer,
  matches_played integer,
  public_code text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    row_number() over (
      order by p.rating desc, p.wins desc, p.created_at asc
    ) as rank,
    p.public_code as id,
    p.display_name,
    p.rating,
    p.wins,
    p.losses,
    p.draws,
    p.matches_played,
    p.public_code
  from public.profiles p
  where p.deleted_at is null
  order by p.rating desc, p.wins desc, p.created_at asc
  limit least(greatest(result_limit, 1), 100);
$$;

create or replace function public.set_onboarding_state(
  requested_completed boolean,
  requested_skipped boolean,
  requested_recommendation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if requested_recommendation is not null
    and requested_recommendation not in ('quick', 'sensory', 'mind') then
    raise exception 'Recommendation is invalid';
  end if;
  insert into public.user_progression (
    user_id, onboarding_completed_at, onboarding_skipped,
    recommended_playlist, updated_at
  )
  values (
    auth.uid(),
    case when requested_completed then now() else null end,
    requested_skipped,
    requested_recommendation,
    now()
  )
  on conflict (user_id) do update set
    onboarding_completed_at = case
      when requested_completed then coalesce(
        public.user_progression.onboarding_completed_at,
        now()
      )
      else null
    end,
    onboarding_skipped = requested_skipped,
    recommended_playlist = requested_recommendation,
    updated_at = now();
  return public.get_my_profile();
end;
$$;

-- ---------------------------------------------------------------------------
-- Private duels and shareable results
-- ---------------------------------------------------------------------------

create or replace function public.game_reveal_duration(requested_game text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case requested_game
    when 'memory_grid' then 1750
    when 'frequency_recall' then 2400
    when 'colour_recall' then 2600
    when 'time_recall' then 6500
    when 'shape_recall' then 2600
    when 'rhythm_recall' then 6500
    when 'dot_estimate' then 2200
    else 0
  end;
$$;

create or replace function public.game_answer_duration(requested_game text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case requested_game
    when 'memory_grid' then 8000
    when 'frequency_recall' then 12000
    when 'colour_recall' then 16000
    when 'time_recall' then 14000
    when 'shape_recall' then 14000
    when 'rhythm_recall' then 20000
    when 'dot_estimate' then 7000
    when 'number_order' then 8000
    when 'odd_one_out' then 6000
    when 'pattern_complete' then 18000
    when 'reaction_test' then 18000
    when 'target_tap' then 16000
    else 8000
  end;
$$;

create or replace function public.private_duel_game(
  requested_duel public.private_duels,
  requested_round integer
)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  sensory_games constant text[] := array[
    'frequency_recall', 'colour_recall', 'time_recall', 'shape_recall', 'rhythm_recall'
  ];
  mind_games constant text[] := array[
    'memory_grid', 'dot_estimate', 'number_order', 'odd_one_out', 'pattern_complete'
  ];
  experimental_games constant text[] := array['reaction_test', 'target_tap'];
  quick_games constant text[] := array[
    'memory_grid', 'frequency_recall', 'colour_recall', 'time_recall',
    'shape_recall', 'rhythm_recall', 'dot_estimate', 'number_order',
    'odd_one_out', 'pattern_complete'
  ];
  pool text[];
begin
  if requested_duel.game_type is not null then return requested_duel.game_type; end if;
  pool := case requested_duel.playlist
    when 'sensory' then sensory_games
    when 'mind' then mind_games
    when 'experimental' then experimental_games
    else quick_games
  end;
  return pool[
    1 + mod(
      abs(mod(
        hashtextextended(requested_duel.id::text || ':' || requested_round::text, 0),
        cardinality(pool)::bigint
      )),
      cardinality(pool)::bigint
    )::integer
  ];
end;
$$;

create or replace function public.create_private_duel_match(
  requested_duel_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  duel_row public.private_duels;
  selected_game text;
  created_match_id uuid;
  created_seed bigint;
begin
  select * into duel_row
  from public.private_duels
  where id = requested_duel_id
  for update;
  if not found or duel_row.guest_id is null
    or duel_row.state in ('completed', 'expired', 'cancelled') then
    raise exception 'Duel is not ready';
  end if;
  if duel_row.current_match_id is not null and exists (
    select 1 from public.matches
    where id = duel_row.current_match_id
      and status in ('waiting', 'countdown', 'active')
  ) then
    return duel_row.current_match_id;
  end if;
  created_seed := floor(random() * 2147483646)::bigint + 1;
  selected_game := public.private_duel_game(duel_row, duel_row.current_round + 1);
  insert into public.matches (
    challenge_seed, game_type, ranked, reveal_duration_ms,
    answer_duration_ms, expires_at, source, playlist,
    private_duel_id, series_round
  )
  values (
    created_seed,
    selected_game,
    duel_row.ranked and selected_game not in ('reaction_test', 'target_tap'),
    public.game_reveal_duration(selected_game),
    public.game_answer_duration(selected_game),
    now() + interval '3 minutes',
    'private_duel',
    duel_row.playlist,
    duel_row.id,
    duel_row.current_round + 1
  )
  returning id into created_match_id;
  insert into public.match_players (match_id, user_id, rating_before)
  select created_match_id, p.id, p.rating
  from public.profiles p
  where p.id in (duel_row.host_id, duel_row.guest_id);
  update public.private_duels
  set
    state = 'active',
    current_round = current_round + 1,
    current_match_id = created_match_id
  where id = duel_row.id;
  return created_match_id;
end;
$$;

create or replace function public.create_private_duel(
  requested_selection_kind text,
  requested_game text,
  requested_playlist text,
  requested_best_of smallint,
  requested_ranked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  generated_code text;
  created_duel public.private_duels;
  valid_games constant text[] := array[
    'memory_grid', 'frequency_recall', 'colour_recall', 'time_recall',
    'shape_recall', 'rhythm_recall', 'dot_estimate', 'number_order',
    'odd_one_out', 'pattern_complete', 'reaction_test', 'target_tap'
  ];
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_profile();
  perform public.check_rate_limit('private_duel_create', 8, 3600);
  if requested_selection_kind not in ('game', 'playlist')
    or requested_best_of not in (1, 3, 5)
    or requested_playlist not in ('quick', 'sensory', 'mind', 'experimental') then
    raise exception 'Duel settings are invalid';
  end if;
  if requested_selection_kind = 'game'
    and (requested_game is null or not requested_game = any(valid_games)) then
    raise exception 'Game is invalid';
  end if;
  if requested_ranked and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Ranked private duels require a linked account';
  end if;
  if requested_ranked and (
    requested_playlist = 'experimental'
    or requested_game in ('reaction_test', 'target_tap')
  ) then
    raise exception 'Experimental games cannot be ranked';
  end if;
  loop
    generated_code := upper(substr(
      translate(encode(extensions.gen_random_bytes(8), 'base64'), '/+=', 'XYZ'),
      1,
      8
    ));
    exit when generated_code ~ '^[A-Z0-9]{8}$'
      and not exists (select 1 from public.private_duels where code = generated_code);
  end loop;
  insert into public.private_duels (
    code, host_id, selection_kind, game_type, playlist, best_of, ranked
  )
  values (
    generated_code,
    caller_id,
    requested_selection_kind,
    case when requested_selection_kind = 'game' then requested_game else null end,
    requested_playlist,
    requested_best_of,
    requested_ranked
  )
  returning * into created_duel;
  return jsonb_build_object(
    'code', created_duel.code,
    'state', created_duel.state,
    'expires_at', created_duel.expires_at
  );
end;
$$;

create or replace function public.get_private_duel(requested_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  duel_row public.private_duels;
  host_name text;
  guest_name text;
  rounds jsonb;
begin
  select * into duel_row
  from public.private_duels
  where code = upper(requested_code);
  if not found then return null; end if;
  if duel_row.expires_at <= now() and duel_row.state = 'waiting' then
    update public.private_duels set state = 'expired' where id = duel_row.id;
    duel_row.state := 'expired';
  end if;
  select display_name into host_name from public.profiles where id = duel_row.host_id;
  select display_name into guest_name from public.profiles where id = duel_row.guest_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'round', m.series_round,
    'match_id', case
      when auth.uid() in (duel_row.host_id, duel_row.guest_id) then m.id
      else null
    end,
    'game_type', m.game_type,
    'status', m.status,
    'winner', case
      when m.winner_id = duel_row.host_id then 'host'
      when m.winner_id = duel_row.guest_id then 'guest'
      else 'draw'
    end
  ) order by m.series_round), '[]'::jsonb)
  into rounds
  from public.matches m
  where m.private_duel_id = duel_row.id;
  return jsonb_build_object(
    'code', duel_row.code,
    'state', duel_row.state,
    'host_name', host_name,
    'guest_name', guest_name,
    'selection_kind', duel_row.selection_kind,
    'game_type', duel_row.game_type,
    'playlist', duel_row.playlist,
    'best_of', duel_row.best_of,
    'ranked', duel_row.ranked,
    'host_score', duel_row.host_score,
    'guest_score', duel_row.guest_score,
    'current_round', duel_row.current_round,
    'current_match_id', case
      when auth.uid() in (duel_row.host_id, duel_row.guest_id)
      then duel_row.current_match_id else null
    end,
    'viewer_role', case
      when auth.uid() = duel_row.host_id then 'host'
      when auth.uid() = duel_row.guest_id then 'guest'
      else 'visitor'
    end,
    'expires_at', duel_row.expires_at,
    'completed_at', duel_row.completed_at,
    'rounds', rounds
  );
end;
$$;

create or replace function public.join_private_duel(requested_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  duel_row public.private_duels;
  created_match_id uuid;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_profile();
  perform public.check_rate_limit('private_duel_join', 20, 3600);
  select * into duel_row
  from public.private_duels
  where code = upper(requested_code)
  for update;
  if not found then raise exception 'Duel not found'; end if;
  if duel_row.expires_at <= now() or duel_row.state <> 'waiting' then
    raise exception 'Duel is no longer available';
  end if;
  if duel_row.host_id = caller_id then
    raise exception 'The host cannot join the guest slot';
  end if;
  if duel_row.guest_id is not null then raise exception 'Duel is full'; end if;
  if duel_row.ranked and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Ranked private duels require a linked account';
  end if;
  if exists (
    select 1 from public.user_blocks
    where (blocker_id = duel_row.host_id and blocked_id = caller_id)
       or (blocker_id = caller_id and blocked_id = duel_row.host_id)
  ) then
    raise exception 'Duel is unavailable';
  end if;
  update public.private_duels
  set guest_id = caller_id, joined_at = now(), state = 'ready'
  where id = duel_row.id and guest_id is null;
  if not found then raise exception 'Duel was joined by another player'; end if;
  created_match_id := public.create_private_duel_match(duel_row.id);
  return jsonb_build_object('joined', true, 'match_id', created_match_id);
end;
$$;

create or replace function public.leave_private_duel(requested_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  duel_row public.private_duels;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into duel_row from public.private_duels
  where code = upper(requested_code) for update;
  if not found or auth.uid() not in (duel_row.host_id, duel_row.guest_id) then
    raise exception 'Duel not found';
  end if;
  if duel_row.state = 'waiting' and auth.uid() = duel_row.host_id then
    update public.private_duels set state = 'cancelled' where id = duel_row.id;
  elsif duel_row.state in ('ready', 'active') then
    update public.private_duels set state = 'cancelled' where id = duel_row.id;
    update public.matches set status = 'cancelled'
    where id = duel_row.current_match_id
      and status in ('waiting', 'countdown', 'active');
  end if;
  return public.get_private_duel(requested_code);
end;
$$;

create or replace function public.enable_match_share(requested_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
begin
  if auth.uid() is null or not public.is_match_participant(requested_match_id) then
    raise exception 'Completed match not found';
  end if;
  perform public.check_rate_limit('share_card', 30, 3600);
  if not exists (
    select 1 from public.matches
    where id = requested_match_id and status = 'completed'
  ) then
    raise exception 'Completed match not found';
  end if;
  loop
    generated_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
    exit when not exists (
      select 1 from public.matches where share_code = generated_code
    );
  end loop;
  update public.matches
  set share_code = coalesce(share_code, generated_code), share_enabled = true
  where id = requested_match_id;
  return (
    select jsonb_build_object('code', share_code)
    from public.matches where id = requested_match_id
  );
end;
$$;

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

-- ---------------------------------------------------------------------------
-- History, personal statistics, and weekly seasons
-- ---------------------------------------------------------------------------

create or replace function public.get_match_history(
  requested_limit integer default 20,
  requested_before timestamptz default null,
  requested_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  result_items jsonb;
  page_size integer := least(greatest(requested_limit, 1), 50);
  next_time timestamptz;
  next_id uuid;
  has_more boolean;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  with history_rows as (
    select
      m.*,
      mine.result_json as my_result,
      mine.completion_time_ms as my_time,
      mine.rating_before as my_rating_before,
      mine.rating_after as my_rating_after,
      mine.rating_delta as my_rating_delta,
      opponent.result_json as opponent_result,
      opponent.completion_time_ms as opponent_time,
      opponent_profile.display_name as opponent_name,
      opponent_profile.public_code as opponent_code
    from public.match_players mine
    join public.matches m on m.id = mine.match_id
    join public.match_players opponent
      on opponent.match_id = mine.match_id and opponent.user_id <> mine.user_id
    join public.profiles opponent_profile on opponent_profile.id = opponent.user_id
    where mine.user_id = caller_id
      and m.status = 'completed'
      and (
        requested_before is null
        or (m.completed_at, m.id) < (requested_before, requested_before_id)
      )
    order by m.completed_at desc, m.id desc
    limit page_size + 1
  ),
  numbered as (
    select *, row_number() over (order by completed_at desc, id desc) as row_number
    from history_rows
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'outcome', case
        when winner_id is null then 'draw'
        when winner_id = caller_id then 'win'
        else 'loss'
      end,
      'opponent_name', opponent_name,
      'opponent_code', opponent_code,
      'game_type', game_type,
      'ranked', ranked,
      'rating_delta', my_rating_delta,
      'player_summary', my_result ->> 'summary',
      'opponent_summary', opponent_result ->> 'summary',
      'player_time_ms', my_time,
      'opponent_time_ms', opponent_time,
      'completed_at', completed_at,
      'source', source,
      'private_duel_id', private_duel_id,
      'series_round', series_round
    ) order by completed_at desc, id desc) filter (where row_number <= page_size), '[]'::jsonb),
    max(completed_at) filter (where row_number = page_size),
    (max(id::text) filter (where row_number = page_size))::uuid,
    count(*) > page_size
  into result_items, next_time, next_id, has_more
  from numbered;
  return jsonb_build_object(
    'items', result_items,
    'next_cursor', case when not has_more then null else jsonb_build_object(
      'completed_at', next_time,
      'id', next_id
    ) end
  );
end;
$$;

create or replace function public.get_match_history_detail(requested_match_id uuid)
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
  if auth.uid() is null or not public.is_match_participant(requested_match_id) then
    raise exception 'Completed match not found';
  end if;
  select * into match_row
  from public.matches
  where id = requested_match_id and status = 'completed';
  if not found then return null; end if;
  select jsonb_agg(jsonb_build_object(
    'display_name', p.display_name,
    'is_winner', match_row.winner_id = mp.user_id,
    'submission', mp.submission_json,
    'result', mp.result_json,
    'completion_time_ms', mp.completion_time_ms,
    'rating_before', mp.rating_before,
    'rating_after', mp.rating_after,
    'rating_delta', mp.rating_delta
  ) order by mp.user_id)
  into players_json
  from public.match_players mp
  join public.profiles p on p.id = mp.user_id
  where mp.match_id = requested_match_id;
  return jsonb_build_object(
    'id', match_row.id,
    'game_type', match_row.game_type,
    'game_version', match_row.game_version,
    'ranked', match_row.ranked,
    'is_draw', match_row.winner_id is null,
    'starts_at', match_row.starts_at,
    'completed_at', match_row.completed_at,
    'source', match_row.source,
    'private_duel_id', match_row.private_duel_id,
    'series_round', match_row.series_round,
    'players', players_json
  );
end;
$$;

create or replace function public.current_season_id()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  season_start timestamptz;
  season_end timestamptz;
  season_id text;
begin
  season_start := date_trunc('week', now() at time zone 'UTC') at time zone 'UTC';
  season_end := season_start + interval '7 days';
  season_id := to_char(season_start at time zone 'UTC', 'IYYY-"W"IW');
  insert into public.season_definitions (id, starts_at, ends_at)
  values (season_id, season_start, season_end)
  on conflict (id) do nothing;
  return season_id;
end;
$$;

create or replace function public.get_season_overview(requested_season_id text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_id text := coalesce(requested_season_id, public.current_season_id());
  season_row public.season_definitions;
  leaderboard jsonb;
  mine jsonb;
begin
  select * into season_row from public.season_definitions where id = selected_id;
  if not found then return null; end if;
  select coalesce(jsonb_agg(to_jsonb(board) order by board.rank), '[]'::jsonb)
  into leaderboard
  from (
    select
      row_number() over (order by s.points desc, s.wins desc, s.updated_at asc) as rank,
      p.display_name,
      p.public_code,
      p.rating,
      s.points,
      s.wins,
      s.losses,
      s.draws,
      s.matches_counted
    from public.season_player_stats s
    join public.profiles p on p.id = s.user_id
    where s.season_id = selected_id and p.deleted_at is null
    order by s.points desc, s.wins desc, s.updated_at asc
    limit 100
  ) board;
  if auth.uid() is not null then
    select to_jsonb(player_row) into mine
    from (
      select
        1 + (
          select count(*) from public.season_player_stats ahead
          where ahead.season_id = selected_id
            and (ahead.points, ahead.wins) > (s.points, s.wins)
        ) as rank,
        s.points, s.wins, s.losses, s.draws, s.matches_counted
      from public.season_player_stats s
      where s.season_id = selected_id and s.user_id = auth.uid()
    ) player_row;
  end if;
  return jsonb_build_object(
    'id', season_row.id,
    'starts_at', season_row.starts_at,
    'ends_at', season_row.ends_at,
    'status', case
      when now() < season_row.starts_at then 'upcoming'
      when now() >= season_row.ends_at then 'archived'
      else 'active'
    end,
    'player', mine,
    'leaderboard', leaderboard
  );
end;
$$;

create or replace function public.get_personal_stats()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  profile_json jsonb;
  recent_form jsonb;
  overall_json jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  profile_json := public.get_my_profile();
  select coalesce(jsonb_agg(outcome order by completed_at desc), '[]'::jsonb)
  into recent_form
  from (
    select
      m.completed_at,
      case
        when m.winner_id is null then 'draw'
        when m.winner_id = auth.uid() then 'win'
        else 'loss'
      end as outcome
    from public.match_players mp
    join public.matches m on m.id = mp.match_id
    where mp.user_id = auth.uid() and m.status = 'completed'
    order by m.completed_at desc
    limit 10
  ) recent;
  select jsonb_build_object(
    'total_matches', count(*),
    'wins', count(*) filter (where m.winner_id = auth.uid()),
    'losses', count(*) filter (where m.winner_id is not null and m.winner_id <> auth.uid()),
    'draws', count(*) filter (where m.winner_id is null)
  )
  into overall_json
  from public.match_players mp
  join public.matches m on m.id = mp.match_id
  where mp.user_id = auth.uid() and m.status = 'completed';
  return profile_json || jsonb_build_object(
    'recent_form', recent_form,
    'overall', overall_json
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Friends, blocks, and duel invitations
-- ---------------------------------------------------------------------------

create or replace function public.are_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = first_user and blocked_id = second_user)
       or (blocker_id = second_user and blocked_id = first_user)
  );
$$;

create or replace function public.search_players(requested_query text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized text := btrim(requested_query);
  results jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.check_rate_limit('friend_search', 30, 600);
  if length(normalized) < 3 or length(normalized) > 32 then
    raise exception 'Search query is invalid';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'display_name', p.display_name,
    'public_code', p.public_code,
    'rating', p.rating,
    'status', case
      when p.last_active_at > now() - interval '2 minutes' then 'online'
      when p.last_active_at > now() - interval '24 hours' then 'recent'
      else 'offline'
    end
  ) order by p.display_name, p.public_code), '[]'::jsonb)
  into results
  from public.profiles p
  where p.id <> auth.uid()
    and p.deleted_at is null
    and not public.are_blocked(auth.uid(), p.id)
    and (
      upper(p.public_code) = upper(replace(normalized, '#', ''))
      or lower(p.display_name) = lower(split_part(normalized, '#', 1))
    )
  limit 20;
  return results;
end;
$$;

create or replace function public.send_friend_request(requested_public_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  created_request uuid;
  low_user uuid;
  high_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.check_rate_limit('friend_request', 12, 3600);
  select id into recipient
  from public.profiles
  where public_code = upper(replace(requested_public_code, '#', ''))
    and deleted_at is null;
  if recipient is null or recipient = auth.uid() then
    raise exception 'Player not found';
  end if;
  if public.are_blocked(auth.uid(), recipient) then raise exception 'Request unavailable'; end if;
  low_user := least(auth.uid()::text, recipient::text)::uuid;
  high_user := greatest(auth.uid()::text, recipient::text)::uuid;
  if exists (
    select 1 from public.friends where user_low = low_user and user_high = high_user
  ) then raise exception 'Already friends'; end if;
  insert into public.friend_requests (requester_id, recipient_id)
  values (auth.uid(), recipient)
  returning id into created_request;
  return jsonb_build_object('id', created_request, 'status', 'pending');
exception when unique_violation then
  raise exception 'A request is already pending';
end;
$$;

create or replace function public.respond_friend_request(
  requested_request_id uuid,
  requested_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.friend_requests;
  low_user uuid;
  high_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into request_row
  from public.friend_requests
  where id = requested_request_id for update;
  if not found or request_row.recipient_id <> auth.uid()
    or request_row.status <> 'pending' then
    raise exception 'Request not found';
  end if;
  if public.are_blocked(request_row.requester_id, request_row.recipient_id) then
    raise exception 'Request unavailable';
  end if;
  update public.friend_requests
  set status = case when requested_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = request_row.id;
  if requested_accept then
    low_user := least(request_row.requester_id::text, request_row.recipient_id::text)::uuid;
    high_user := greatest(request_row.requester_id::text, request_row.recipient_id::text)::uuid;
    insert into public.friends (user_low, user_high)
    values (low_user, high_user)
    on conflict do nothing;
  end if;
  return jsonb_build_object(
    'id', request_row.id,
    'status', case when requested_accept then 'accepted' else 'declined' end
  );
end;
$$;

create or replace function public.remove_friend(requested_public_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into other_user from public.profiles
  where public_code = upper(replace(requested_public_code, '#', ''));
  delete from public.friends
  where user_low = least(auth.uid()::text, other_user::text)::uuid
    and user_high = greatest(auth.uid()::text, other_user::text)::uuid;
  return jsonb_build_object('removed', found);
end;
$$;

create or replace function public.block_player(requested_public_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into other_user from public.profiles
  where public_code = upper(replace(requested_public_code, '#', ''))
    and deleted_at is null;
  if other_user is null or other_user = auth.uid() then raise exception 'Player not found'; end if;
  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), other_user)
  on conflict do nothing;
  delete from public.friends
  where user_low = least(auth.uid()::text, other_user::text)::uuid
    and user_high = greatest(auth.uid()::text, other_user::text)::uuid;
  update public.friend_requests set status = 'cancelled', responded_at = now()
  where status = 'pending'
    and requester_id in (auth.uid(), other_user)
    and recipient_id in (auth.uid(), other_user);
  update public.duel_invitations set status = 'cancelled', responded_at = now()
  where status = 'pending'
    and sender_id in (auth.uid(), other_user)
    and recipient_id in (auth.uid(), other_user);
  return jsonb_build_object('blocked', true);
end;
$$;

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

create or replace function public.send_duel_invitation(
  requested_public_code text,
  requested_selection_kind text,
  requested_game text,
  requested_playlist text,
  requested_best_of smallint,
  requested_ranked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
  duel_json jsonb;
  duel_id uuid;
  invitation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.check_rate_limit('duel_invitation', 10, 3600);
  if (
    select count(*)
    from public.duel_invitations
    where sender_id = auth.uid()
      and created_at > now() - interval '1 hour'
  ) >= 5 and not exists (
    select 1 from public.abuse_flags
    where user_id = auth.uid()
      and signal = 'excessive_invitations'
      and created_at > now() - interval '1 hour'
  ) then
    insert into public.abuse_flags (user_id, signal, severity, evidence)
    values (
      auth.uid(),
      'excessive_invitations',
      2,
      jsonb_build_object('window', '1 hour')
    );
  end if;
  select id into recipient from public.profiles
  where public_code = upper(replace(requested_public_code, '#', ''))
    and deleted_at is null;
  if recipient is null or recipient = auth.uid() or public.are_blocked(auth.uid(), recipient) then
    raise exception 'Invitation unavailable';
  end if;
  if not exists (
    select 1 from public.friends
    where user_low = least(auth.uid()::text, recipient::text)::uuid
      and user_high = greatest(auth.uid()::text, recipient::text)::uuid
  ) then raise exception 'Only friends can receive direct invitations'; end if;
  duel_json := public.create_private_duel(
    requested_selection_kind,
    requested_game,
    requested_playlist,
    requested_best_of,
    requested_ranked
  );
  select id into duel_id from public.private_duels where code = duel_json ->> 'code';
  insert into public.duel_invitations (sender_id, recipient_id, private_duel_id)
  values (auth.uid(), recipient, duel_id)
  returning id into invitation_id;
  return jsonb_build_object(
    'id', invitation_id,
    'duel_code', duel_json ->> 'code',
    'status', 'pending'
  );
exception when unique_violation then
  raise exception 'An invitation is already pending';
end;
$$;

create or replace function public.respond_duel_invitation(
  requested_invitation_id uuid,
  requested_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_row public.duel_invitations;
  duel_code text;
  join_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation_row
  from public.duel_invitations
  where id = requested_invitation_id for update;
  if not found or invitation_row.recipient_id <> auth.uid()
    or invitation_row.status <> 'pending'
    or invitation_row.expires_at <= now() then
    raise exception 'Invitation is unavailable';
  end if;
  update public.duel_invitations
  set status = case when requested_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = invitation_row.id;
  if not requested_accept then
    return jsonb_build_object('status', 'declined');
  end if;
  select code into duel_code from public.private_duels
  where id = invitation_row.private_duel_id;
  join_result := public.join_private_duel(duel_code);
  return jsonb_build_object(
    'status', 'accepted',
    'duel_code', duel_code,
    'match_id', join_result ->> 'match_id'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cosmetics, deletion, admin, analytics, and match completion triggers
-- ---------------------------------------------------------------------------

create or replace function public.get_cosmetics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_json jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'type', c.cosmetic_type,
    'name', c.name,
    'configuration', c.configuration,
    'owned', c.free or uc.user_id is not null,
    'equipped', ec.cosmetic_id = c.id
  ) order by c.cosmetic_type, c.name), '[]'::jsonb)
  into result_json
  from public.cosmetics c
  left join public.user_cosmetics uc
    on uc.cosmetic_id = c.id and uc.user_id = auth.uid()
  left join public.equipped_cosmetics ec
    on ec.cosmetic_id = c.id and ec.user_id = auth.uid()
  where c.active;
  return result_json;
end;
$$;

create or replace function public.equip_cosmetic(requested_cosmetic_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cosmetic_row public.cosmetics;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into cosmetic_row from public.cosmetics
  where id = requested_cosmetic_id and active;
  if not found then raise exception 'Cosmetic not found'; end if;
  if not cosmetic_row.free and not exists (
    select 1 from public.user_cosmetics
    where user_id = auth.uid() and cosmetic_id = requested_cosmetic_id
  ) then raise exception 'Cosmetic is not owned'; end if;
  insert into public.equipped_cosmetics (user_id, cosmetic_type, cosmetic_id)
  values (auth.uid(), cosmetic_row.cosmetic_type, cosmetic_row.id)
  on conflict (user_id, cosmetic_type) do update set
    cosmetic_id = excluded.cosmetic_id,
    updated_at = now();
  return public.get_cosmetics();
end;
$$;

create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  delete from public.friends where caller_id in (user_low, user_high);
  delete from public.friend_requests where caller_id in (requester_id, recipient_id);
  delete from public.user_blocks where caller_id in (blocker_id, blocked_id);
  delete from public.duel_invitations where caller_id in (sender_id, recipient_id);
  update public.private_duels
  set state = 'cancelled'
  where state in ('waiting', 'ready', 'active')
    and caller_id in (host_id, guest_id);
  update public.profiles
  set
    display_name = 'Deleted' || substr(replace(caller_id::text, '-', ''), 1, 8),
    public_code = public.allocate_public_code(caller_id),
    accent_colour = 'white',
    account_state = 'deleted',
    deleted_at = now()
  where id = caller_id;
  insert into public.audit_log (actor_id, action, target_user_id)
  values (caller_id, 'account_deletion_requested', caller_id);
  return jsonb_build_object('deleted', true);
end;
$$;

create or replace function public.get_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  flags jsonb;
  audits jsonb;
begin
  if not public.is_admin(array['admin', 'moderator', 'analyst']) then
    raise exception 'Admin access required';
  end if;
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into flags
  from (
    select af.id, af.signal, af.severity, af.status, af.created_at,
      p.display_name, p.public_code, af.match_id
    from public.abuse_flags af
    left join public.profiles p on p.id = af.user_id
    order by af.created_at desc limit 100
  ) row_data;
  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into audits
  from (
    select al.id, al.action, al.reason, al.created_at, al.target_match_id,
      actor.display_name as actor_name, target.display_name as target_name
    from public.audit_log al
    left join public.profiles actor on actor.id = al.actor_id
    left join public.profiles target on target.id = al.target_user_id
    order by al.created_at desc limit 100
  ) row_data;
  return jsonb_build_object('flags', flags, 'audit', audits);
end;
$$;

create or replace function public.admin_lookup_player(requested_public_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  enforcement public.account_enforcement;
begin
  if not public.is_admin(array['admin', 'moderator', 'analyst']) then
    raise exception 'Admin access required';
  end if;
  select * into target
  from public.profiles
  where public_code = upper(replace(requested_public_code, '#', ''));
  if not found then return null; end if;
  select * into enforcement
  from public.account_enforcement
  where user_id = target.id;
  return jsonb_build_object(
    'display_name', target.display_name,
    'public_code', target.public_code,
    'rating', target.rating,
    'matches_played', target.matches_played,
    'profile_state', target.account_state,
    'enforcement_state', coalesce(enforcement.state, 'normal'),
    'enforcement_reason', enforcement.reason,
    'enforcement_expires_at', enforcement.expires_at,
    'open_flags', (
      select count(*) from public.abuse_flags
      where user_id = target.id and status in ('open', 'reviewing')
    ),
    'invitations_24h', (
      select count(*) from public.duel_invitations
      where sender_id = target.id and created_at > now() - interval '24 hours'
    ),
    'ranked_matches_24h', (
      select count(*)
      from public.match_players mp
      join public.matches m on m.id = mp.match_id
      where mp.user_id = target.id
        and m.ranked
        and m.completed_at > now() - interval '24 hours'
    )
  );
end;
$$;

create or replace function public.admin_set_enforcement(
  requested_public_code text,
  requested_state text,
  requested_reason text,
  requested_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if not public.is_admin(array['admin', 'moderator']) then
    raise exception 'Admin access required';
  end if;
  if requested_state not in (
    'normal', 'warning', 'ranked_restricted', 'temporarily_suspended',
    'manually_banned'
  ) then raise exception 'Enforcement state is invalid'; end if;
  select id into target_id from public.profiles
  where public_code = upper(replace(requested_public_code, '#', ''));
  if target_id is null then raise exception 'Player not found'; end if;
  insert into public.account_enforcement (
    user_id, state, reason, expires_at, updated_at, updated_by
  )
  values (
    target_id,
    requested_state,
    nullif(btrim(requested_reason), ''),
    case when requested_duration_minutes is null then null
      else now() + make_interval(mins => requested_duration_minutes) end,
    now(),
    auth.uid()
  )
  on conflict (user_id) do update set
    state = excluded.state,
    reason = excluded.reason,
    expires_at = excluded.expires_at,
    updated_at = now(),
    updated_by = auth.uid();
  update public.profiles set account_state = requested_state where id = target_id;
  insert into public.audit_log (
    actor_id, action, target_user_id, reason, metadata
  )
  values (
    auth.uid(),
    'enforcement_changed',
    target_id,
    nullif(btrim(requested_reason), ''),
    jsonb_build_object('state', requested_state, 'duration_minutes', requested_duration_minutes)
  );
  return jsonb_build_object('updated', true, 'state', requested_state);
end;
$$;

create or replace function public.admin_invalidate_match(
  requested_match_id uuid,
  requested_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['admin']) then raise exception 'Admin access required'; end if;
  update public.matches
  set invalidated_at = coalesce(invalidated_at, now()), ranked = false
  where id = requested_match_id and status = 'completed';
  if not found then raise exception 'Completed match not found'; end if;
  insert into public.audit_log (
    actor_id, action, target_match_id, reason
  )
  values (auth.uid(), 'match_invalidated', requested_match_id, requested_reason);
  return jsonb_build_object('invalidated', true);
end;
$$;

create or replace function public.get_analytics_report(
  requested_since timestamptz default (now() - interval '30 days')
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  events jsonb;
begin
  if not public.is_admin(array['admin', 'analyst']) then
    raise exception 'Analytics access required';
  end if;
  select coalesce(jsonb_object_agg(event_type, event_count), '{}'::jsonb)
  into events
  from (
    select event_type, count(*) as event_count
    from public.analytics_events
    where occurred_at >= requested_since
    group by event_type
  ) counts;
  return jsonb_build_object(
    'since', requested_since,
    'events', events,
    'landing_to_play', (
      select jsonb_build_object(
        'landing', count(*) filter (where event_type = 'landing_viewed'),
        'play', count(*) filter (where event_type = 'play_clicked')
      )
      from public.analytics_events where occurred_at >= requested_since
    ),
    'queue', (
      select jsonb_build_object(
        'joined', count(*) filter (where event_type = 'queue_joined'),
        'cancelled', count(*) filter (where event_type = 'queue_cancelled'),
        'average_wait_ms', avg(duration_ms) filter (where event_type = 'human_match_found')
      )
      from public.analytics_events where occurred_at >= requested_since
    )
  );
end;
$$;

create or replace function public.after_match_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row record;
  opponent_id uuid;
  season_id text;
  pair_low uuid;
  pair_high uuid;
  counted integer;
  duel_row public.private_duels;
  wins_needed integer;
  should_finish boolean;
begin
  if old.status = 'completed' or new.status <> 'completed' then return new; end if;

  for player_row in
    select
      mp.user_id,
      mp.rating_after,
      mp.calculated_score,
      mp.completion_time_ms,
      mp.result_json,
      mp.submission_json,
      case
        when new.winner_id is null then 'draw'
        when new.winner_id = mp.user_id then 'win'
        else 'loss'
      end as outcome
    from public.match_players mp
    where mp.match_id = new.id
  loop
    insert into public.user_progression (
      user_id, highest_rating, current_win_streak, best_win_streak, updated_at
    )
    values (
      player_row.user_id,
      coalesce(player_row.rating_after, 1000),
      case when player_row.outcome = 'win' then 1 else 0 end,
      case when player_row.outcome = 'win' then 1 else 0 end,
      now()
    )
    on conflict (user_id) do update set
      highest_rating = greatest(
        public.user_progression.highest_rating,
        coalesce(player_row.rating_after, public.user_progression.highest_rating)
      ),
      current_win_streak = case
        when player_row.outcome = 'win'
          then public.user_progression.current_win_streak + 1
        else 0
      end,
      best_win_streak = greatest(
        public.user_progression.best_win_streak,
        case when player_row.outcome = 'win'
          then public.user_progression.current_win_streak + 1
          else public.user_progression.best_win_streak
        end
      ),
      updated_at = now();
    update public.game_stats
    set
      total_rank_score = total_rank_score + coalesce(player_row.calculated_score, 0),
      total_time_ms = total_time_ms + coalesce(player_row.completion_time_ms, 0),
      recent_results = public.trim_recent_game_results(
        recent_results,
        jsonb_build_object(
          'at', new.completed_at,
          'score', player_row.calculated_score,
          'time_ms', player_row.completion_time_ms,
          'outcome', player_row.outcome
        )
      )
    where user_id = player_row.user_id and game_type = new.game_type;

    if coalesce((player_row.result_json ->> 'accuracy')::numeric, 0) >= 0.999
      and (
        select count(*)
        from public.match_players recent_player
        join public.matches recent_match on recent_match.id = recent_player.match_id
        where recent_player.user_id = player_row.user_id
          and recent_match.status = 'completed'
          and recent_match.completed_at > now() - interval '24 hours'
          and coalesce((recent_player.result_json ->> 'accuracy')::numeric, 0) >= 0.999
      ) >= 5
      and not exists (
        select 1 from public.abuse_flags
        where user_id = player_row.user_id
          and signal = 'excessive_perfect_scores'
          and created_at > now() - interval '1 hour'
      ) then
      insert into public.abuse_flags (user_id, match_id, signal, severity, evidence)
      values (
        player_row.user_id,
        new.id,
        'excessive_perfect_scores',
        2,
        jsonb_build_object('window', '24 hours', 'threshold', 5)
      );
    end if;

    if not (player_row.submission_json ? 'timedOut')
      and (
        select count(*)
        from public.match_players repeated_player
        join public.matches repeated_match on repeated_match.id = repeated_player.match_id
        where repeated_player.user_id = player_row.user_id
          and repeated_match.status = 'completed'
          and repeated_match.game_type = new.game_type
          and repeated_match.completed_at > now() - interval '24 hours'
          and repeated_player.submission_json = player_row.submission_json
      ) >= 4
      and not exists (
        select 1 from public.abuse_flags
        where user_id = player_row.user_id
          and signal = 'repeated_identical_submission'
          and created_at > now() - interval '1 hour'
      ) then
      insert into public.abuse_flags (user_id, match_id, signal, severity, evidence)
      values (
        player_row.user_id,
        new.id,
        'repeated_identical_submission',
        2,
        jsonb_build_object('game_type', new.game_type, 'window', '24 hours')
      );
    end if;
  end loop;

  insert into public.audit_log (
    action, target_match_id, metadata
  )
  values (
    'rating_finalized',
    new.id,
    jsonb_build_object('ranked', new.ranked, 'source', new.source)
  );

  if new.ranked and new.invalidated_at is null then
    select mp.user_id into pair_low
    from public.match_players mp where mp.match_id = new.id
    order by mp.user_id::text limit 1;
    select mp.user_id into pair_high
    from public.match_players mp where mp.match_id = new.id
    order by mp.user_id::text desc limit 1;
    season_id := public.current_season_id();
    insert into public.season_pair_daily_counts (
      season_id, player_low, player_high, match_day, matches_counted
    )
    values (
      season_id, pair_low, pair_high, (now() at time zone 'UTC')::date, 1
    )
    on conflict (season_id, player_low, player_high, match_day)
    do update set matches_counted =
      public.season_pair_daily_counts.matches_counted + 1
    where public.season_pair_daily_counts.matches_counted < 3
    returning matches_counted into counted;
    if counted is not null then
      for player_row in
        select mp.user_id,
          case
            when new.winner_id is null then 1
            when new.winner_id = mp.user_id then 3
            else 0
          end as points,
          case when new.winner_id = mp.user_id then 1 else 0 end as won,
          case when new.winner_id is not null and new.winner_id <> mp.user_id then 1 else 0 end as lost,
          case when new.winner_id is null then 1 else 0 end as drawn
        from public.match_players mp where mp.match_id = new.id
      loop
        insert into public.season_player_stats (
          season_id, user_id, points, wins, losses, draws, matches_counted
        )
        values (
          season_id, player_row.user_id, player_row.points,
          player_row.won, player_row.lost, player_row.drawn, 1
        )
        on conflict (season_id, user_id) do update set
          points = public.season_player_stats.points + excluded.points,
          wins = public.season_player_stats.wins + excluded.wins,
          losses = public.season_player_stats.losses + excluded.losses,
          draws = public.season_player_stats.draws + excluded.draws,
          matches_counted = public.season_player_stats.matches_counted + 1,
          updated_at = now();
      end loop;
    else
      insert into public.abuse_flags (user_id, match_id, signal, severity, evidence)
      select
        mp.user_id,
        new.id,
        'repeated_ranked_pair',
        2,
        jsonb_build_object('daily_counting_limit', 3, 'season_id', season_id)
      from public.match_players mp
      where mp.match_id = new.id;
    end if;
  end if;

  if new.private_duel_id is not null then
    select * into duel_row from public.private_duels
    where id = new.private_duel_id for update;
    update public.private_duels
    set
      host_score = host_score + case when new.winner_id = duel_row.host_id then 1 else 0 end,
      guest_score = guest_score + case when new.winner_id = duel_row.guest_id then 1 else 0 end
    where id = duel_row.id
    returning * into duel_row;
    wins_needed := (duel_row.best_of + 1) / 2;
    should_finish := duel_row.host_score >= wins_needed
      or duel_row.guest_score >= wins_needed
      or duel_row.current_round >= duel_row.best_of;
    if should_finish then
      update public.private_duels
      set state = 'completed', completed_at = now()
      where id = duel_row.id;
    else
      update public.private_duels set current_match_id = null where id = duel_row.id;
      perform public.create_private_duel_match(duel_row.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger matches_after_completion
after update of status on public.matches
for each row execute function public.after_match_completed();

-- Fix the recent-results update with a compact trigger-safe expression.
create or replace function public.trim_recent_game_results(
  requested_existing jsonb,
  requested_new jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(value order by position), '[]'::jsonb)
  from jsonb_array_elements(jsonb_build_array(requested_new) || requested_existing)
    with ordinality as items(value, position)
  where position <= 10;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

alter table public.user_progression enable row level security;
alter table public.private_duels enable row level security;
alter table public.season_definitions enable row level security;
alter table public.season_player_stats enable row level security;
alter table public.season_pair_daily_counts enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friends enable row level security;
alter table public.user_blocks enable row level security;
alter table public.duel_invitations enable row level security;
alter table public.analytics_events enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.abuse_flags enable row level security;
alter table public.account_enforcement enable row level security;
alter table public.admin_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.cosmetics enable row level security;
alter table public.user_cosmetics enable row level security;
alter table public.equipped_cosmetics enable row level security;

revoke all on table
  public.user_progression,
  public.private_duels,
  public.season_definitions,
  public.season_player_stats,
  public.season_pair_daily_counts,
  public.friend_requests,
  public.friends,
  public.user_blocks,
  public.duel_invitations,
  public.analytics_events,
  public.rate_limit_buckets,
  public.abuse_flags,
  public.account_enforcement,
  public.admin_roles,
  public.audit_log,
  public.cosmetics,
  public.user_cosmetics,
  public.equipped_cosmetics
from public, anon, authenticated;

revoke all on function public.allocate_public_code(uuid) from public, anon, authenticated;
revoke all on function public.set_profile_public_code() from public, anon, authenticated;
revoke all on function public.ensure_progression() from public, anon, authenticated;
revoke all on function public.is_admin(text[]) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.touch_presence() from public, anon, authenticated;
revoke all on function public.get_queue_health(text, text) from public, anon, authenticated;
revoke all on function public.enforce_queue_access() from public, anon, authenticated;
revoke all on function public.set_onboarding_state(boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.game_reveal_duration(text) from public, anon, authenticated;
revoke all on function public.game_answer_duration(text) from public, anon, authenticated;
revoke all on function public.private_duel_game(public.private_duels, integer) from public, anon, authenticated;
revoke all on function public.create_private_duel_match(uuid) from public, anon, authenticated;
revoke all on function public.create_private_duel(text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.get_private_duel(text) from public, anon, authenticated;
revoke all on function public.join_private_duel(text) from public, anon, authenticated;
revoke all on function public.leave_private_duel(text) from public, anon, authenticated;
revoke all on function public.enable_match_share(uuid) from public, anon, authenticated;
revoke all on function public.get_public_match_share(text) from public, anon, authenticated;
revoke all on function public.get_match_history(integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.get_match_history_detail(uuid) from public, anon, authenticated;
revoke all on function public.current_season_id() from public, anon, authenticated;
revoke all on function public.get_season_overview(text) from public, anon, authenticated;
revoke all on function public.get_personal_stats() from public, anon, authenticated;
revoke all on function public.are_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.search_players(text) from public, anon, authenticated;
revoke all on function public.send_friend_request(text) from public, anon, authenticated;
revoke all on function public.respond_friend_request(uuid, boolean) from public, anon, authenticated;
revoke all on function public.remove_friend(text) from public, anon, authenticated;
revoke all on function public.block_player(text) from public, anon, authenticated;
revoke all on function public.get_friends_state() from public, anon, authenticated;
revoke all on function public.send_duel_invitation(text, text, text, text, smallint, boolean) from public, anon, authenticated;
revoke all on function public.respond_duel_invitation(uuid, boolean) from public, anon, authenticated;
revoke all on function public.get_cosmetics() from public, anon, authenticated;
revoke all on function public.equip_cosmetic(text) from public, anon, authenticated;
revoke all on function public.request_account_deletion() from public, anon, authenticated;
revoke all on function public.get_admin_overview() from public, anon, authenticated;
revoke all on function public.admin_lookup_player(text) from public, anon, authenticated;
revoke all on function public.admin_set_enforcement(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.admin_invalidate_match(uuid, text) from public, anon, authenticated;
revoke all on function public.get_analytics_report(timestamptz) from public, anon, authenticated;
revoke all on function public.after_match_completed() from public, anon, authenticated;
revoke all on function public.trim_recent_game_results(jsonb, jsonb) from public, anon, authenticated;

grant execute on function public.touch_presence() to authenticated;
grant execute on function public.get_queue_health(text, text) to anon, authenticated;
grant execute on function public.set_onboarding_state(boolean, boolean, text) to authenticated;
grant execute on function public.create_private_duel(text, text, text, smallint, boolean) to authenticated;
grant execute on function public.get_private_duel(text) to anon, authenticated;
grant execute on function public.join_private_duel(text) to authenticated;
grant execute on function public.leave_private_duel(text) to authenticated;
grant execute on function public.enable_match_share(uuid) to authenticated;
grant execute on function public.get_public_match_share(text) to anon, authenticated;
grant execute on function public.get_match_history(integer, timestamptz, uuid) to authenticated;
grant execute on function public.get_match_history_detail(uuid) to authenticated;
grant execute on function public.get_season_overview(text) to anon, authenticated;
grant execute on function public.get_personal_stats() to authenticated;
grant execute on function public.search_players(text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(text) to authenticated;
grant execute on function public.block_player(text) to authenticated;
grant execute on function public.get_friends_state() to authenticated;
grant execute on function public.send_duel_invitation(text, text, text, text, smallint, boolean) to authenticated;
grant execute on function public.respond_duel_invitation(uuid, boolean) to authenticated;
grant execute on function public.get_cosmetics() to authenticated;
grant execute on function public.equip_cosmetic(text) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.get_admin_overview() to authenticated;
grant execute on function public.admin_lookup_player(text) to authenticated;
grant execute on function public.admin_set_enforcement(text, text, text, integer) to authenticated;
grant execute on function public.admin_invalidate_match(uuid, text) to authenticated;
grant execute on function public.get_analytics_report(timestamptz) to authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;
grant execute on function public.is_admin(text[]) to authenticated;
revoke all on function public.get_public_leaderboard(integer) from public, anon, authenticated;
grant execute on function public.get_public_leaderboard(integer) to anon, authenticated;

commit;
