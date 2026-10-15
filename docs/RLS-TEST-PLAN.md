# RLS Test Plan (M1.3)

> **Why this file exists:** M1.3's Definition of Done is not "policies written". It is *"you have personally run the test plan and seen an unauthorized query fail."* A policy that silently allows too much produces no error and no warning — a `SELECT` just returns more rows than it should. Nothing catches that except deliberately trying to break in.
>
> **Where to run it:** Supabase dashboard → SQL Editor.
>
> **Important:** the SQL Editor connects as `postgres`, a superuser, and **superusers bypass RLS entirely**. Every block below therefore does `set local role authenticated` (or `anon`) first. Skip that and everything appears to pass while nothing is being tested.
>
> Every block is wrapped in `begin … rollback`, so running this leaves no data behind.

---

## Setup — two users and three recipes

Run once. This one block is committed rather than rolled back; the teardown at the bottom removes it.

```sql
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into profiles (id, username) values
  ('11111111-1111-1111-1111-111111111111','alice_test'),
  ('22222222-2222-2222-2222-222222222222','bob_test')
on conflict do nothing;

insert into ingredients (canonical_name, slug, aisle_category)
values ('rlstest tofu','rlstest-tofu','Protein')
on conflict do nothing;

insert into recipes (slug, title, servings, status, author_id) values
  ('rlstest-published','RLS Published',2,'published','11111111-1111-1111-1111-111111111111'),
  ('rlstest-draft',    'RLS Draft',    2,'draft',    '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

insert into recipe_ingredients (recipe_id, ingredient_id, quantity, sort_order)
select r.id, i.id, 1, 1
from recipes r, ingredients i
where r.slug in ('rlstest-published','rlstest-draft')
  and i.canonical_name = 'rlstest tofu'
on conflict do nothing;

insert into favorites (user_id, recipe_id)
select '11111111-1111-1111-1111-111111111111', id
from recipes where slug = 'rlstest-published'
on conflict do nothing;
```

---

## Test 1 — logged out sees published recipes only

```sql
begin;
  set local role anon;

  select slug, status from recipes where slug like 'rlstest-%' order by slug;
rollback;
```

**Expect:** exactly one row, `rlstest-published`. If `rlstest-draft` appears, drafts are leaking to the public internet.

---

## Test 2 — a draft's ingredients don't leak through the child table

The mistake this catches: hiding `recipes` but leaving `recipe_ingredients` world-readable, so the recipe is reconstructable through the back door.

```sql
begin;
  set local role anon;

  select count(*) as visible_ingredient_rows
  from recipe_ingredients ri
  join recipes r on r.id = ri.recipe_id
  where r.slug like 'rlstest-%';
rollback;
```

**Expect:** `1`. Not 2.

---

## Test 3 — the author sees their own draft

```sql
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

  select slug, status from recipes where slug like 'rlstest-%' order by slug;
rollback;
```

**Expect:** both rows. If only the published one appears, authors can't see their own drafts and M5.2 is broken.

---

## Test 4 — a different user does NOT see that draft

```sql
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select slug, status from recipes where slug like 'rlstest-%' order by slug;
rollback;
```

**Expect:** only `rlstest-published`.

---

## Test 5 — you cannot create a recipe in someone else's name

```sql
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  insert into recipes (slug, title, servings, author_id)
  values ('rlstest-forged','Forged',2,'11111111-1111-1111-1111-111111111111');
rollback;
```

**Expect:** `ERROR: new row violates row-level security policy for table "recipes"`.
**This is the unauthorized failure the DoD asks you to see.** Read the error text yourself.

---

## Test 6 — you cannot edit or delete someone else's recipe

```sql
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  update recipes set title = 'Hacked' where slug = 'rlstest-published';
  delete from recipes              where slug = 'rlstest-published';
rollback;
```

**Expect:** `UPDATE 0` and `DELETE 0` — **not** an error.

This is the single most important thing to understand about RLS. A `USING` clause filters *which rows the command can see*. A row you're not allowed to touch isn't rejected; it is **invisible**, so the statement matches nothing and reports success against zero rows. Application code that checks "did this throw?" will conclude the update worked. Check the affected-row count instead.

---

## Test 7 — you cannot steal a recipe by reassigning it

```sql
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  insert into recipes (slug, title, servings, author_id)
  values ('rlstest-bob','Bob Own',2,'22222222-2222-2222-2222-222222222222');

  update recipes
  set    author_id = '11111111-1111-1111-1111-111111111111'
  where  slug = 'rlstest-bob';
rollback;
```

**Expect:** the insert succeeds, the update **errors**.

This is what `with check` buys on an `UPDATE`. With only `using`, Bob owns the row he's touching, so the command is permitted — and nothing would examine what the row *became*. `with check` validates the post-write state.

---

## Test 8 — favorites are private, and aren't an id oracle

```sql
begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

  select count(*) as alices_favorites_visible_to_bob from favorites;

  insert into favorites (user_id, recipe_id)
  select '11111111-1111-1111-1111-111111111111', id
  from recipes where slug = 'rlstest-published';
rollback;
```

**Expect:** count `0`, then `ERROR: new row violates row-level security policy for table "favorites"`.

---

## Test 8b — favorites cannot be edited, and account deletion is self-only (wave 3)

Run against a LOCAL stack only (`supabase/tests/accounts_rls_test.sh` automates 11 cases; with email confirmations ON, first mark user B confirmed via SQL). Never against live.

- `favorites` has select, insert and delete policies and **no update policy**: an `UPDATE` as the owner returns `UPDATE 0`.
- Bob can neither read, patch nor delete Alice's favorites; `anon` is denied.
- `delete_my_account()` is callable by `authenticated` only (`anon` gets `42501`) and deletes only `auth.uid()`; afterwards the user's `auth.users`, `profiles` and `favorites` rows are gone and other users are untouched. Verify by counting.

---

## Test 9 — reference data is readable but not writable

```sql
begin;
  set local role anon;
  select count(*) as units_visible from units;
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
  insert into allergens (name, slug) values ('Fake','fake');
rollback;
```

**Expect:** a non-zero count (16 units), then an RLS error on the insert.

Reference tables have a `SELECT` policy and no write policy at all. **Omitting a policy is how you deny** — there is no `deny` statement in RLS. Anything not explicitly granted is refused.

---

## Test 10 — end to end, through the real API

Not SQL. Run in a terminal. This is the only test that exercises the actual path a browser takes, with the actual publishable key.

```bash
source .env.local
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/recipes?select=slug,status" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
```

**Expect:** `rlstest-published` present, `rlstest-draft` absent.

---

## Teardown

```sql
delete from recipes  where slug like 'rlstest-%';
delete from ingredients where canonical_name = 'rlstest tofu';
delete from profiles where username in ('alice_test','bob_test');
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
```

---

## What was already verified locally

Every test above was run against a throwaway Postgres 16 container with a stubbed `auth` schema and real `anon` / `authenticated` roles before the migration was pushed — 10 read tests and 8 write tests, all passing. That is not a substitute for running it here: the local run proves the *policies* are right, and this run proves they are right **on your actual database**, which is the thing the DoD cares about.

---

## Wave 5+6 additions (2026-10-13): automated suites

These tables and policies are covered by files in `supabase/tests/`, not by hand-run SQL above. SQL suites run on a snapshot or local stack with `psql -v ON_ERROR_STOP=1 -f <file>`; `.sh` suites need a LOCAL Supabase stack and real JWTs and must never be pointed at live. A bare snapshot has no Supabase default grants, so role-based suites need them added (throwaway DB only).

| Table / policy | Suite | Needs |
|---|---|---|
| `fridge_items` (owner-only, 150-row cap, unique per ingredient) | `fridge_rls_test.sh` (24 checks) | local stack |
| `shopping_list_items` (owner-only, column-level UPDATE on `checked`, 500-row cap), `add_recipe_to_shopping_list`, `import_local_shopping_list` | `shopping_list_test.sql` (25 checks), `shopping_list_api_test.sh` (T1-T10) | local stack for the `.sh`; account deletion cascades |
| `user_cookware` (select/insert/delete own, no UPDATE) | `user_cookware_rls_test.sql` (9) | stack with default grants |
| Catalog is operator-written: no author INSERT/UPDATE/DELETE on `recipes`, `recipe_steps`, `recipe_ingredients`, `recipe_diets`, `recipe_cookware`; `profiles` owner-only; narrowed grants; pinned trigger functions | `security_hardening_test.sql` (15) | snapshot or stack |
| Hashed-subquery visibility policies | `perf_rls_equivalence_test.sql` (42; updated to expect author writes denied) | stack with default grants |
| `recipe_reviews`, `admins`, `admin_*` | `admin_review_test.sql`, `admin_review_api_test.sh` | local stack |
| Favourites, profiles | `accounts_rls_test.sh` | local stack |

Re-run all of them after any policy or grant change. If author submissions (M5) are built, add cases proving an author cannot set `status = 'published'`, `has_photo`, `image_url` or `source_*`.

## Wave 7 addition (2026-10-14): user-submitted recipes (M5)

Authors still have **no** INSERT/UPDATE/DELETE privilege on any recipe table; all author writes go through SECURITY DEFINER RPCs (`save_my_recipe`, `delete_my_recipe`, `withdraw_my_recipe`; reads via `my_recipes`, `my_recipe_for_edit`). Suite: `supabase/tests/user_recipes_test.sql` (rolls back; runs on a snapshot or a local stack; run as the non-superuser `postgres` role on a stack for the privilege check). It proves, with the counts: anon cannot call or write; authenticated has no direct table writes; author A cannot read, save, delete, withdraw or load author B recipes (same `P0002` as "does not exist"); forged `status`, `author_id`, `image_url`, `slug`, `calories`, `has_photo`, `source_*` keys are ignored; nobody can self-publish; editing a published recipe returns it to `in_review` and clears its review; submitting needs the rights confirmation, an ingredient and a step; every unresolved ingredient or unit is refused and writes nothing; caps (50 recipes, 10 in review); allergens are derived, never supplied; admins see user recipes in the queue (source `user`), never-submitted drafts stay private and cannot be approved; `delete_my_account()` removes the person's recipes.
