begin;
create table public.player_avatars (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  image text not null check (length(image) between 16 and 65536 and image ~ '^[A-Za-z0-9+/]+={0,2}$'),
  updated_at timestamptz not null default now()
);
alter table public.player_avatars enable row level security;
revoke all on public.player_avatars from public, anon, authenticated;
grant select on public.player_avatars to service_role;

create or replace function public.set_player_avatar(requested_profile_id uuid, requested_image text)
returns void language plpgsql security definer set search_path=''
as $avatar$
begin
  perform 1 from public.profiles where id=requested_profile_id and deleted_at is null
    and account_state not in ('temporarily_suspended','manually_banned','deleted') for update;
  if not found then raise exception using errcode='P0001', message='QD_FORBIDDEN'; end if;
  if requested_image is null then
    delete from public.player_avatars where profile_id=requested_profile_id;
  else
    insert into public.player_avatars(profile_id,image) values(requested_profile_id,requested_image)
    on conflict(profile_id) do update set image=excluded.image,updated_at=now();
  end if;
end;
$avatar$;
revoke all on function public.set_player_avatar(uuid,text) from public,anon,authenticated;
grant execute on function public.set_player_avatar(uuid,text) to service_role;

create or replace function public.remove_deleted_player_avatar()
returns trigger language plpgsql security definer set search_path=''
as $cleanup$
begin
  if new.deleted_at is not null then delete from public.player_avatars where profile_id=new.id; end if;
  return new;
end;
$cleanup$;
revoke all on function public.remove_deleted_player_avatar() from public,anon,authenticated;
create trigger qd_delete_avatar after update of deleted_at on public.profiles
for each row when (new.deleted_at is not null) execute function public.remove_deleted_player_avatar();
commit;
