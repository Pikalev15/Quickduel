begin;

-- Hosted Supabase projects can grant newly created functions to API roles
-- through default privileges. Remove every inherited/default execute grant,
-- then expose only the RPC surface QuickDuel intentionally supports.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.generated_display_name(uuid) from public, anon, authenticated;
revoke all on function public.ensure_profile() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.is_match_participant(uuid) from public, anon, authenticated;
revoke all on function public.generate_highlighted_cells(bigint, integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_my_profile() from public, anon, authenticated;
revoke all on function public.get_public_leaderboard(integer) from public, anon, authenticated;
revoke all on function public.get_public_activity() from public, anon, authenticated;
revoke all on function public.join_matchmaking() from public, anon, authenticated;
revoke all on function public.heartbeat_matchmaking() from public, anon, authenticated;
revoke all on function public.leave_matchmaking() from public, anon, authenticated;
revoke all on function public.get_match_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.mark_match_ready(uuid) from public, anon, authenticated;
revoke all on function public.finalize_match_locked(uuid) from public, anon, authenticated;
revoke all on function public.submit_match_answer(uuid, integer[])
  from public, anon, authenticated;
revoke all on function public.request_rematch(uuid) from public, anon, authenticated;
revoke all on function public.can_access_match_topic(text) from public, anon, authenticated;

grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.is_match_participant(uuid) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.join_matchmaking() to authenticated;
grant execute on function public.heartbeat_matchmaking() to authenticated;
grant execute on function public.leave_matchmaking() to authenticated;
grant execute on function public.get_match_snapshot(uuid) to authenticated;
grant execute on function public.mark_match_ready(uuid) to authenticated;
grant execute on function public.submit_match_answer(uuid, integer[]) to authenticated;
grant execute on function public.request_rematch(uuid) to authenticated;
grant execute on function public.can_access_match_topic(text) to authenticated;
grant execute on function public.get_public_leaderboard(integer) to anon, authenticated;
grant execute on function public.get_public_activity() to anon, authenticated;

commit;
