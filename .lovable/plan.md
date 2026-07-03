## Root cause
When `lukeinco@gmail.com` is created, the DB trigger `handle_new_user_superadmin_bootstrap` immediately inserts rows into `user_roles` (superadmin) and `org_members`. Then `src/routes/api/admin.signup.ts` also tries to insert into `user_roles` (admin) and `org_members` for the same user/org — collides with the unique key `org_members_user_id_org_id_key`, the route returns 500, and rolls back the auth user. Net result: you can never complete signup as the superadmin email.

## Fix
Make the signup route tolerate rows the trigger already created.

In `src/routes/api/admin.signup.ts`:
- Change the `user_roles` insert to an upsert on `(user_id, role)` with `ignoreDuplicates: true`. Superadmin already implies admin capabilities via `has_role` checks per-role, and re-adding `admin` for a superadmin is harmless — but the duplicate `admin` row for a non-bootstrap user is also fine; the conflict we actually need to swallow is the bootstrap case.
- Change the `org_members` insert to an upsert on `(user_id, org_id)` with `ignoreDuplicates: true`, so the trigger's pre-existing membership doesn't crash the flow.
- Keep the existing rollback (`auth.admin.deleteUser`) for any *other* error.

No schema changes, no RLS changes, no client changes.

## After the fix
Retry `/admin/signup` with code `CR-BOOT01`, email `lukeinco@gmail.com`, and a password. Signup succeeds, you're signed in as superadmin, and land on `/admin`.
