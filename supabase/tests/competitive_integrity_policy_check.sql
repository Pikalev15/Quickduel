begin;
do $grants$
declare
  signature text;
begin
  foreach signature in array array[
    'public.issue_queue_duel_ticket(uuid,text,jsonb)',
    'public.join_matchmaking(text,text)',
    'public.heartbeat_matchmaking(text,text)',
    'public.create_private_duel(text,text,text,smallint,boolean)',
    'public.create_private_duel_workshop(text,text,text,smallint,boolean,jsonb)',
    'public.join_private_duel(text)',
    'public.send_duel_invitation(text,text,text,text,smallint,boolean)',
    'public.respond_duel_invitation(uuid,boolean)'
  ] loop
    if has_function_privilege('authenticated',signature,'EXECUTE') or has_function_privilege('anon',signature,'EXECUTE') then
      raise exception 'Client can call protected operation: %', signature;
    end if;
  end loop;
  if not has_function_privilege('service_role','public.issue_queue_duel_ticket(uuid,text,jsonb)','EXECUTE')
    or not has_function_privilege('authenticated','public.server_queue_or_duel(uuid)','EXECUTE')
    or has_function_privilege('anon','public.server_queue_or_duel(uuid)','EXECUTE')
    or has_function_privilege('service_role','public.server_queue_or_duel(uuid)','EXECUTE')
    or has_function_privilege('anon','public.check_rate_limit(text,integer,integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.check_rate_limit(text,integer,integer)','EXECUTE')
    or has_table_privilege('authenticated','public.queue_duel_tickets','SELECT')
    or has_table_privilege('authenticated','public.queue_duel_tickets','INSERT')
    or has_table_privilege('authenticated','public.rate_limit_buckets','INSERT')
    or has_table_privilege('authenticated','public.rate_limit_buckets','UPDATE')
    or not (select relrowsecurity from pg_class where oid='public.queue_duel_tickets'::regclass)
  then raise exception 'Incorrect gateway or rate-limit grants'; end if;
end;
$grants$;
rollback;
