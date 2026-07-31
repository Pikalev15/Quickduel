# Admin and moderation

`/admin` is server-gated and its APIs call database functions that re-check
`admin_roles`. Roles are `admin`, `moderator`, and `analyst`; enforcement
requires admin/moderator privileges and match invalidation is admin-only. The UI provides health,
open flags, public-code player/status lookup, suspicious activity totals,
30-day analytics, confirmed enforcement changes, confirmed ranked-match
invalidation, and the audit trail.

There is intentionally no `ADMIN_USER_IDS` environment variable and no
client-side authorization list.

## Safe bootstrap

After the migration, identify the intended owner's authenticated profile UUID in
the Supabase dashboard and run once in the SQL editor:

```sql
insert into public.admin_roles (user_id, role, created_by)
values ('OWNER_PROFILE_UUID', 'admin', null)
on conflict (user_id) do update set role = excluded.role;
```

Use a linked, permanent account, record the bootstrap in the deployment change
log, then use the audited application path for subsequent role/enforcement
changes. Never place the UUID or a service key in the repository.

Match invalidation marks a completed match for review; it does not silently
recalculate historical Elo. Any rating correction remains a deliberate database
operation until a compensating-transaction workflow is built.
