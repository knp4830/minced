# RLS test plan: admin review (wave 4, M1.5.6)

A new section for `docs/RLS-TEST-PLAN.md`, kept separate by the wave rules (the integrator folds it in). Two runnable suites; both are LOCAL only and clean up after themselves.

| Suite | What it proves | Run |
|---|---|---|
| `supabase/tests/admin_review_test.sql` | Role-level checks in one rolled-back transaction: anon, an ordinary user and an admin against every policy and `admin_*` function | `docker exec -i <pg> psql -v ON_ERROR_STOP=1 -U postgres < supabase/tests/admin_review_test.sql`, expect `ALL PASS` |
| `supabase/tests/admin_review_api_test.sh` | The same through PostgREST with real GoTrue JWTs, plus "a rejected recipe disappears from the public API" | see the header of the script; expect `failures: 0` |

## Cases

| # | Caller | Attempt | Expected |
|---|---|---|---|
| A1 | anon | call any `admin_*` function | 42501 (no EXECUTE) |
| A2 | anon | select `recipe_reviews`, `admins`, call `is_admin()` | 42501 |
| U1 | signed-in, not admin | call any `admin_*` function | 42501 |
| U2 | signed-in, not admin | `select` from `admins` / `recipe_reviews` | zero rows |
| U3 | signed-in, not admin | insert into `admins` (self-promote) | 42501 |
| U4 | signed-in, not admin | PATCH `profiles` with `is_admin` | column does not exist (there is no such flag; this is why it is a table) |
| U5 | signed-in, not admin | insert into `recipe_reviews` | 42501 (RLS) |
| U6 | signed-in, not admin | update a recipe directly | 0 rows (existing author policy, unchanged) |
| U7 | signed-in, not admin | call `admin_assert()` | 42501 (not granted) |
| D1 | admin | reject a recipe | `recipes.status = draft`, row kept, anon `GET /recipes?slug=eq.<slug>` returns `[]` |
| D2 | admin | reject, then reset to unreviewed | status restored from `prior_status` |
| D3 | admin | batch approve | counts match, published count unchanged |
| D4 | admin | edit title, step, quantity, prep note | persisted, `updated_at` bumped |
| D5 | admin | swap ingredient via an unresolvable name | 22023, whole edit rolled back |
| D6 | admin | edit an ingredient or step id from another recipe | 22023 |
| D7 | admin | blank title, bad state, over 200 slugs | 22023 |
| D8 | admin | `select count(*) from recipes where slug = <rejected>` as a plain query | 0: the public RLS is unchanged even for admins (the queue reads through the RPCs) |

No existing policy was changed or weakened; this migration adds two tables, their policies, and functions only.

## Promote an admin (live, run by the owner after they sign up)

```sql
insert into admins (user_id)
select id from auth.users where email = '<your sign-in email>';
-- verify: should return 1
select count(*) from admins;
```

Run it in the Supabase SQL Editor (it runs as `postgres`). Remove an admin with `delete from admins where user_id = ...`.
