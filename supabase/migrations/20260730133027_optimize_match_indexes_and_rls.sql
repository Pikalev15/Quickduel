begin;

create index if not exists matches_winner_id_idx
  on public.matches (winner_id);

create index if not exists matches_rematch_match_id_idx
  on public.matches (rematch_match_id);

drop policy if exists "Players read their own per-game stats"
  on public.game_stats;

create policy "Players read their own per-game stats"
on public.game_stats
for select
to authenticated
using (user_id = (select auth.uid()));

commit;
