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
