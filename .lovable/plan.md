## Goal
Give you a working invite code so you can complete `/admin/signup` as `lukeinco@gmail.com`. The existing DB trigger will automatically grant superadmin + org membership the moment that email is created.

## Change
One migration that inserts a single unused invite code tied to the "TekMyBiz Screening" org:

- `code`: `CR-BOOT01`
- `org_id`: id of the "TekMyBiz Screening" row in `public.orgs`
- `used_by`: NULL
- `expires_at`: `now() + interval '7 days'`
- Idempotent: `ON CONFLICT (code) DO NOTHING` so re-running is safe

No schema changes, no code changes, no RLS changes.

## How you sign in after it runs
1. Go to `/admin/signup`
2. Invite code: `CR-BOOT01`
3. Email: `lukeinco@gmail.com`
4. Password: 8+ characters of your choice
5. Submit → the `handle_new_user_superadmin_bootstrap` trigger fires → you're superadmin, dropped on `/review` (then `/admin`)
6. The code auto-consumes on use, so it can't be reused

## Why the earlier login attempt failed
The auth log shows a `400 invalid_credentials` on `/token` — the account simply doesn't exist yet. Signup has to happen first; there's no separate "create superadmin" path.
