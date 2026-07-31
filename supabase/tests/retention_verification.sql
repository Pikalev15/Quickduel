begin;

select plan(35);

select has_table('public', 'private_duels', 'private duels table exists');
select has_table('public', 'user_progression', 'progression table exists');
select has_table('public', 'season_definitions', 'season table exists');
select has_table('public', 'season_player_stats', 'season player stats exist');
select has_table('public', 'friend_requests', 'friend requests table exists');
select has_table('public', 'friends', 'friends table exists');
select has_table('public', 'user_blocks', 'blocks table exists');
select has_table('public', 'duel_invitations', 'duel invitations table exists');
select has_table('public', 'analytics_events', 'analytics events table exists');
select has_table('public', 'abuse_flags', 'abuse flags table exists');
select has_table('public', 'account_enforcement', 'account enforcement exists');
select has_table('public', 'audit_log', 'audit log exists');
select has_table('public', 'admin_roles', 'admin roles exist');
select has_table('public', 'cosmetics', 'cosmetics catalogue exists');
select has_table('public', 'user_cosmetics', 'cosmetic ownership exists');

select col_is_unique('public', 'profiles', 'public_code', 'public codes are unique');
select col_not_null('public', 'profiles', 'public_code', 'public codes are required');
select col_has_check('public', 'private_duels', 'best_of', 'private series formats are checked');
select col_is_fk('public', 'matches', 'private_duel_id', 'matches reference private duels');
select col_is_fk('public', 'duel_invitations', 'private_duel_id', 'invitations reference duels');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.private_duels'::regclass),
  'private duels have RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.friend_requests'::regclass),
  'friend requests have RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.analytics_events'::regclass),
  'analytics events have RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_roles'::regclass),
  'admin roles have RLS'
);

select function_returns(
  'public', 'create_private_duel',
  array['text', 'text', 'text', 'smallint', 'boolean'],
  'jsonb',
  'private duel creation is exposed through a narrow function'
);
select function_returns(
  'public', 'join_private_duel',
  array['text'],
  'jsonb',
  'private duel joining is transactional'
);
select function_returns(
  'public', 'get_match_history',
  array['integer', 'timestamp with time zone', 'uuid'],
  'jsonb',
  'history is cursor based'
);
select function_returns(
  'public', 'get_personal_stats',
  array[]::text[],
  'jsonb',
  'personal stats use a narrow function'
);
select function_returns(
  'public', 'admin_set_enforcement',
  array['text', 'text', 'text', 'integer'],
  'jsonb',
  'enforcement is server-authorized'
);
select function_returns(
  'public', 'admin_lookup_player',
  array['text'],
  'jsonb',
  'admin player lookup is server-authorized'
);

select ok(
  not has_function_privilege('anon', 'public.create_private_duel(text,text,text,smallint,boolean)', 'EXECUTE'),
  'anonymous HTTP role cannot create a duel without an Auth user'
);
select ok(
  not has_function_privilege('anon', 'public.get_match_history(integer,timestamptz,uuid)', 'EXECUTE'),
  'anonymous HTTP role cannot read private history'
);
select ok(
  not has_function_privilege('anon', 'public.get_admin_overview()', 'EXECUTE'),
  'anonymous HTTP role cannot call admin overview'
);
select ok(
  has_function_privilege('anon', 'public.get_private_duel(text)', 'EXECUTE'),
  'public duel lobby state is intentionally link-readable'
);
select ok(
  has_function_privilege('anon', 'public.get_public_match_share(text)', 'EXECUTE'),
  'explicitly enabled result shares are public'
);

select * from finish();
rollback;
