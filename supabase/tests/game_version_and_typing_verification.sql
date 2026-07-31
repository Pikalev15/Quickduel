begin;

select plan(16);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_game_type_check'
      and pg_get_constraintdef(oid) like '%frequency_recall_v2%'
      and pg_get_constraintdef(oid) like '%colour_recall_v2%'
      and pg_get_constraintdef(oid) like '%typing_sprint%'
  ),
  'match game types include both v2 recall IDs and Typing Sprint'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matches'::regclass
      and conname = 'matches_game_version_check'
      and pg_get_constraintdef(oid) like '%game_version = 2%'
      and pg_get_constraintdef(oid) like '%game_version = 1%'
  ),
  'match versions permit only the supported v1 and v2 combinations'
);

select is(
  public.game_reveal_duration('memory_grid'),
  2950,
  'Memory Grid persists its flash and retention interval'
);
select is(
  public.game_reveal_duration('frequency_recall_v2'),
  0,
  'Frequency Recall v2 uses round-local reveal timing'
);
select is(
  public.game_answer_duration('frequency_recall_v2'),
  30000,
  'Frequency Recall v2 has a 30-second match window'
);
select is(
  public.game_reveal_duration('colour_recall_v2'),
  0,
  'Colour Recall v2 uses round-local reveal timing'
);
select is(
  public.game_answer_duration('colour_recall_v2'),
  40000,
  'Colour Recall v2 has a 40-second match window'
);
select is(
  public.game_answer_duration('typing_sprint'),
  15000,
  'Typing Sprint has a fixed 15-second match window'
);

select is_definer(
  'public',
  'join_matchmaking',
  array['text', 'text'],
  'matchmaking remains security definer'
);
select is_definer(
  'public',
  'create_private_duel',
  array['text', 'text', 'text', 'smallint', 'boolean'],
  'private duel creation remains security definer'
);
select is_definer(
  'public',
  'create_private_duel_match',
  array['uuid'],
  'private match creation remains security definer'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.join_matchmaking(text,text)',
    'EXECUTE'
  ),
  'anonymous database role cannot invoke matchmaking directly'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.join_matchmaking(text,text)',
    'EXECUTE'
  ),
  'authenticated users retain matchmaking access'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_private_duel(text,text,text,smallint,boolean)',
    'EXECUTE'
  ),
  'authenticated users retain private duel creation access'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_private_duel_match(uuid)',
    'EXECUTE'
  ),
  'internal private match creation stays unexposed'
);
select ok(
  position(
    'typing_sprint' in pg_get_functiondef(
      'public.join_matchmaking(text,text)'::regprocedure
    )
  ) > 0,
  'server matchmaking includes Typing Sprint'
);

select * from finish();
rollback;
