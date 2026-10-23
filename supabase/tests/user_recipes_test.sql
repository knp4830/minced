-- Wave 7 / M5: user-recipe submission model (migration 20261014120000_user_recipes).
--
-- RUNS ON: a throwaway database only (the .snapshot restore, or a local Supabase stack).
--   psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f supabase/tests/user_recipes_test.sql
-- NEVER run against live: it creates users and recipes. It is wrapped in one
-- transaction and ROLLS BACK, so nothing persists even on a throwaway database.
--
-- Roles are switched with SET LOCAL ROLE plus request.jwt.claim.sub (the claim
-- auth.uid() reads). A bare snapshot has no Supabase default grants, so the
-- header below grants SELECT only (what production keeps after security_hardening)
-- and explicitly revokes writes, so "direct writes are refused" is tested honestly.
-- SNAPSHOT CAVEAT: pg_dump covers schema public only, so the snapshot has the public wrappers but no
-- private.* implementations, no feature_flags rows' grants and no revokes. Before running on a bare
-- snapshot, create private.* from the five functions in 20261014120000_user_recipes.sql (rename to
-- private.), revoke their execute and user_recipe_text/feature_enabled from public/anon/authenticated,
-- and grant the public wrappers to authenticated. Prefer a local Supabase stack. Calories are not asserted
-- null on a new draft: the wave 10 save_my_recipe wrapper computes nutrients on save.
-- Any failed assertion raises and aborts the run; success prints "ALL PASSED".

begin;

-- Production state after 20261013160000_security_hardening: read-only for the API roles.
grant usage on schema public to anon, authenticated;
grant select on recipes, recipe_steps, recipe_ingredients, recipe_diets, recipe_cookware,
                recipe_allergens, recipe_photos, ingredients, units, cuisines, diets, cookware,
                allergens, ingredient_aliases, favorites, profiles
  to anon, authenticated;
grant select on admins, recipe_reviews to authenticated;
revoke insert, update, delete, truncate on recipes, recipe_steps, recipe_ingredients, recipe_diets,
                recipe_cookware, recipe_allergens, recipe_reviews, admins from anon, authenticated;

create function t_expect(sql text, want text, want_hint text default null) returns void
language plpgsql as $$
declare
  done boolean := false;
  h text;
begin
  begin
    execute sql;
  exception when others then
    get stacked diagnostics h = pg_exception_hint;
    if sqlstate <> want then
      raise exception 'expected % got % (%) for: %', want, sqlstate, sqlerrm, sql;
    end if;
    if want_hint is not null and h is distinct from want_hint then
      raise exception 'expected hint % got % for: %', want_hint, h, sql;
    end if;
    done := true;
  end;
  if not done then
    raise exception 'expected % but statement succeeded: %', want, sql;
  end if;
end $$;
grant execute on function t_expect(text, text, text) to public;

create function t_assert(cond boolean, msg text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERT FAILED: %', msg;
  end if;
end $$;
grant execute on function t_assert(boolean, text) to public;

-- A valid payload; tests override single keys with ||.
create function t_data() returns jsonb language sql as $$
  select jsonb_build_object(
    'title', 'Test scallion eggs', 'description', 'Quick eggs.', 'servings', 2,
    'prep_time_min', 5, 'cook_time_min', 10, 'spice_level', 1, 'cost_per_serving', 1.5,
    'ingredients', jsonb_build_array(
      jsonb_build_object('quantity', '2', 'unit', 'Tablespoons', 'name', 'green onion', 'prep_note', 'sliced'),
      jsonb_build_object('quantity', 0.5, 'unit', '', 'name', 'egg')),
    'steps', jsonb_build_array('Whisk the eggs.', 'Fry with scallion.'),
    'diets', '[]'::jsonb, 'cookware', '[]'::jsonb, 'rights_confirmed', true);
$$;
grant execute on function t_data() to public;

-- Users ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@test.invalid'),
  ('00000000-0000-4000-8000-0000000000b2', 'b@test.invalid'),
  ('00000000-0000-4000-8000-0000000000ad', 'admin@test.invalid'),
  ('00000000-0000-4000-8000-0000000000c3', 'c@test.invalid'),
  ('00000000-0000-4000-8000-0000000000d4', 'd@test.invalid')
on conflict do nothing;
insert into profiles (id) values
  ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000b2'),
  ('00000000-0000-4000-8000-0000000000ad'), ('00000000-0000-4000-8000-0000000000c3'),
  ('00000000-0000-4000-8000-0000000000d4')
on conflict do nothing;
insert into admins (user_id) values ('00000000-0000-4000-8000-0000000000ad') on conflict do nothing;

create temp table ids (k text primary key, v uuid);
grant all on ids to public;
create temp table before_counts as select count(*) as n from recipes;
select count(*) as imported_recipes from recipes \gset
-- The feature switch ships OFF (section 14 tests that); everything below runs with it on.
update feature_flags set enabled = true where name = 'user_recipes';

-- ===== 1. anon cannot write or call anything ============================================
set local role anon;
select t_expect($q$select save_my_recipe(null, t_data(), false)$q$, '42501');
select t_expect($q$select my_recipes()$q$, '42501');
select t_expect($q$insert into recipes (slug, title, servings) values ('x', 'x', 1)$q$, '42501');
reset role;

-- ===== 2. authenticated has no direct write on any recipe table ==========================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select t_expect($q$insert into recipes (slug, title, servings, author_id, status)
                   values ('direct', 'Direct', 1, '00000000-0000-4000-8000-0000000000a1', 'published')$q$, '42501');
select t_expect($q$update recipes set status = 'published'$q$, '42501');
select t_expect($q$delete from recipes$q$, '42501');
select t_expect($q$insert into recipe_steps (recipe_id, sort_order, instruction)
                   select id, 99, 'x' from recipes limit 1$q$, '42501');
select t_expect($q$update recipe_ingredients set quantity = 1$q$, '42501');
select t_expect($q$insert into recipe_diets (recipe_id, diet_id) select id, 1 from recipes limit 1$q$, '42501');
select t_expect($q$insert into recipe_reviews (recipe_id, review_status) select id, 'approved' from recipes limit 1$q$, '42501');
select t_expect($q$insert into admins (user_id) values ('00000000-0000-4000-8000-0000000000a1')$q$, '42501');
reset role;
do $$ begin raise notice 'ok: 1-2 anon and direct writes refused'; end $$;

-- ===== 3. author creates a draft ========================================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
insert into ids select 'a_draft', (save_my_recipe(null, t_data(), false) ->> 'id')::uuid;
reset role;

select t_assert((select status = 'draft' and author_id = '00000000-0000-4000-8000-0000000000a1'
                        and source_name = 'User submission' and image_url is null
                        and published_at is null and has_photo = false
                   from recipes where id = (select v from ids where k = 'a_draft')), 'draft row shape');
select t_assert((select slug ~ '^test-scallion-eggs-[0-9a-f]{8}$' from recipes where id = (select v from ids where k = 'a_draft')), 'slug shape');
select t_assert((select count(*) = 2 from recipe_ingredients where recipe_id = (select v from ids where k = 'a_draft')), '2 ingredient rows');
select t_assert((select ingredient_id = (select ingredient_id from resolve_ingredient('scallion') limit 1)
                        and unit_id = (select unit_id from resolve_unit('tbsp') limit 1) and quantity = 2 and prep_note = 'sliced'
                   from recipe_ingredients where recipe_id = (select v from ids where k = 'a_draft') and sort_order = 0), 'alias + unit resolved');
select t_assert((select quantity = 0.5 and unit_id is null
                   from recipe_ingredients where recipe_id = (select v from ids where k = 'a_draft') and sort_order = 1), 'fraction quantity, blank unit');
select t_assert((select count(*) = 2 from recipe_steps where recipe_id = (select v from ids where k = 'a_draft')), '2 steps');
do $$ begin raise notice 'ok: 3 draft creation and resolution'; end $$;

-- ===== 4. privacy: drafts invisible to others ============================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
set local role authenticated;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_draft')), 'B cannot read A draft');
select t_assert((select count(*) = 0 from recipe_steps where recipe_id = (select v from ids where k = 'a_draft')), 'B cannot read A steps');
select t_assert((select count(*) = 0 from my_recipes()), 'B my_recipes empty');
select t_assert((select my_recipe_for_edit((select v from ids where k = 'a_draft')) is null), 'B cannot load A for edit');
-- B cannot touch A's recipe in any way, and learns nothing (same error as "does not exist").
select t_expect(format($q$select save_my_recipe(%L, t_data(), false)$q$, (select v from ids where k = 'a_draft')), 'P0002');
select t_expect(format($q$select delete_my_recipe(%L)$q$, (select v from ids where k = 'a_draft')), 'P0002');
select t_expect(format($q$select withdraw_my_recipe(%L)$q$, (select v from ids where k = 'a_draft')), 'P0002');
reset role;
set local role anon;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_draft')), 'anon cannot read draft');
reset role;
select t_assert((select title = 'Test scallion eggs' from recipes where id = (select v from ids where k = 'a_draft')), 'A draft untouched by B');
do $$ begin raise notice 'ok: 4 isolation between authors'; end $$;

-- ===== 5. validation: every failure writes nothing =========================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select count(*) as a_rows_before from recipes where author_id = '00000000-0000-4000-8000-0000000000a1' \gset
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('ingredients', jsonb_build_array(
    jsonb_build_object('name', 'egg'), jsonb_build_object('name', 'xqzvkj wpqzx'))), false)$q$, '22023', 'ingredient:2');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('ingredients', jsonb_build_array(
    jsonb_build_object('name', 'egg', 'unit', 'bananas'))), false)$q$, '22023', 'ingredient:1');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('ingredients', jsonb_build_array(
    jsonb_build_object('name', 'egg', 'quantity', '0'))), false)$q$, '22023', 'ingredient:1');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('ingredients', jsonb_build_array(
    jsonb_build_object('name', 'egg', 'quantity', '-2'))), false)$q$, '22023', 'ingredient:1');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('ingredients', jsonb_build_array(
    jsonb_build_object('name', '', 'quantity', '2'))), false)$q$, '22023', 'ingredient:1');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('title', 'ab'), false)$q$, '22023', 'title');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('title', repeat('x', 121)), false)$q$, '22023', 'title');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('servings', 0), false)$q$, '22023', 'servings');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('servings', 101), false)$q$, '22023', 'servings');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('servings', 1.5), false)$q$, '22023', 'servings');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('spice_level', 5), false)$q$, '22023', 'spice');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('prep_time_min', -1), false)$q$, '22023', 'prep_time');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('cook_time_min', 1441), false)$q$, '22023', 'cook_time');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('cost_per_serving', 1000), false)$q$, '22023', 'cost');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('cuisine_id', 999999), false)$q$, '22023', 'cuisine');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('diets', jsonb_build_array(999999)), false)$q$, '22023', 'diets');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('cookware', jsonb_build_array(999999)), false)$q$, '22023', 'cookware');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('description', repeat('x', 501)), false)$q$, '22023', 'description');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('steps', jsonb_build_array(repeat('x', 1001))), false)$q$, '22023', 'step');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('steps', (select jsonb_agg('s'::text) from generate_series(1, 41))), false)$q$, '22023', 'steps');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('ingredients', (select jsonb_agg(jsonb_build_object('name', 'egg')) from generate_series(1, 61))), false)$q$, '22023', 'ingredients');
select t_expect($q$select save_my_recipe(null, '[]'::jsonb, false)$q$, '22023');
select t_expect($q$select save_my_recipe(null, null, false)$q$, '22023');
-- Submitting needs an ingredient and a step.
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('ingredients', '[]'::jsonb), true)$q$, '22023', 'ingredients');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('steps', '[]'::jsonb), true)$q$, '22023', 'steps');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('steps', jsonb_build_array('   ', '')), true)$q$, '22023', 'steps');
-- Submitting needs the rights confirmation (server-enforced clickwrap).
select t_expect($q$select save_my_recipe(null, t_data() - 'rights_confirmed', true)$q$, '22023', 'rights');
select t_expect($q$select save_my_recipe(null, t_data() || jsonb_build_object('rights_confirmed', false), true)$q$, '22023', 'rights');
-- ...but a half-written DRAFT is fine.
select t_assert((save_my_recipe(null, t_data() || jsonb_build_object('title', 'Bare draft', 'ingredients', '[]'::jsonb, 'steps', '[]'::jsonb), false) ->> 'status') = 'draft', 'bare draft allowed');
reset role;
select t_assert((select count(*) = :a_rows_before + 1 from recipes where author_id = '00000000-0000-4000-8000-0000000000a1'), 'failed saves wrote nothing');
do $$ begin raise notice 'ok: 5 validation'; end $$;

-- Text cleaning: control and bidi characters stripped, whitespace collapsed.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
insert into ids select 'a_clean', (save_my_recipe(null, t_data() || jsonb_build_object('title', E'  Crisp‮   Toast​  ', 'steps', jsonb_build_array(E'Heat\x01 pan.\n\n\n\nServe.')), false) ->> 'id')::uuid;
reset role;
select t_assert((select title = 'Crisp Toast' from recipes where id = (select v from ids where k = 'a_clean')), 'title cleaned: ' || (select title from recipes where id = (select v from ids where k = 'a_clean')));
select t_assert((select instruction = E'Heat pan.\n\nServe.' from recipe_steps where recipe_id = (select v from ids where k = 'a_clean')), 'step cleaned');
do $$ begin raise notice 'ok: 5b text cleaning'; end $$;

-- ===== 6. nobody can self-publish or forge columns ============================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
insert into ids select 'a_sub', (save_my_recipe(null, t_data() || jsonb_build_object(
    'title', 'Forged fields', 'status', 'published', 'author_id', '00000000-0000-4000-8000-0000000000b2',
    'image_url', 'https://evil.example/x.jpg', 'published_at', now(), 'slug', 'chosen-slug',
    'calories', 1, 'has_photo', true, 'source_name', 'USDA MyPlate Kitchen', 'source_url', 'https://evil.example',
    'source_license', 'public domain'), true) ->> 'id')::uuid;
reset role;
select t_assert((select status = 'in_review' and author_id = '00000000-0000-4000-8000-0000000000a1' and image_url is null
                        and published_at is null and slug <> 'chosen-slug' and calories is distinct from 1 and has_photo = false
                        and source_name = 'User submission' and source_url is null and source_license = 'user-submitted'
                   from recipes where id = (select v from ids where k = 'a_sub')), 'forged columns ignored');
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_sub') and status = 'published'), 'not published');
-- Anonymous visitors still cannot see it.
set local role anon;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_sub')), 'in_review is not public');
reset role;
do $$ begin raise notice 'ok: 6 no self-publish, no forged columns'; end $$;

-- Slugs, read as the owner role (other roles cannot see these rows).
select slug as s_sub from recipes where id = (select v from ids where k = 'a_sub') \gset
select slug as s_draft from recipes where id = (select v from ids where k = 'a_draft') \gset

-- ===== 7. admin queue: user recipes appear, non-admins are refused =============================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
set local role authenticated;
select t_expect($q$select * from admin_review_list('all', null, null, 10)$q$, '42501');
select t_expect($q$select admin_set_review(array['x'], 'approved')$q$, '42501');
select t_expect($q$select admin_update_recipe('x', 'T')$q$, '42501');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ad', true);
set local role authenticated;
select t_assert((select count(*) = 1 from admin_review_list('unreviewed', 'user', null, 50)
                  where slug = :'s_sub' and state = 'unreviewed'),
                'submitted recipe in the user queue');
-- Private drafts are not in the queue.
select t_assert((select count(*) = 0 from admin_review_list('all', 'user', null, 200)
                  where slug = :'s_draft'), 'draft not in queue');
select t_assert((select admin_recipe_detail(:'s_draft') is null), 'draft has no admin detail');
select t_assert((select admin_set_review(array[:'s_draft'], 'approved')) = 0, 'draft approval refused');
select t_assert((select sum(n) = :imported_recipes from admin_review_progress() where source_key <> 'user'), 'imported rows still all in the queue');
reset role;
select t_assert((select status = 'draft' from recipes where id = (select v from ids where k = 'a_draft')), 'draft still draft');
do $$ begin raise notice 'ok: 7 admin queue scope'; end $$;

-- ===== 8. approve -> public; author edit -> back to review; reject -> returned ==================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ad', true);
set local role authenticated;
select t_assert(admin_set_review(array[:'s_sub'], 'approved') = 1, 'approve one');
reset role;
select t_assert((select status = 'published' and published_at is not null from recipes where id = (select v from ids where k = 'a_sub')), 'published by admin');
set local role anon;
select t_assert((select count(*) = 1 from recipes where id = (select v from ids where k = 'a_sub')), 'anon can read published');
select t_assert((select count(*) = 2 from recipe_ingredients where recipe_id = (select v from ids where k = 'a_sub')), 'anon reads its ingredients');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
-- Editing a published recipe (p_submit false) still goes back to review.
select t_assert((save_my_recipe((select v from ids where k = 'a_sub'), t_data() || jsonb_build_object('title', 'Forged fields v2'), false) ->> 'status') = 'in_review', 'edit of published -> in_review');
reset role;
select t_assert((select status = 'in_review' and title = 'Forged fields v2' from recipes where id = (select v from ids where k = 'a_sub')), 'status flipped');
select t_assert((select count(*) = 0 from recipe_reviews where recipe_id = (select v from ids where k = 'a_sub')), 'review row cleared by edit');
set local role anon;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_sub')), 'edited recipe left the public site');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ad', true);
set local role authenticated;
select t_assert(admin_set_review(array[:'s_sub'], 'rejected', 'Please add amounts') = 1, 'reject');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select t_assert((select returned and review_note = 'Please add amounts' and status = 'draft'
                   from my_recipes() where id = (select v from ids where k = 'a_sub')), 'author sees the returned note');
select t_assert((my_recipe_for_edit((select v from ids where k = 'a_sub')) ->> 'returned')::boolean, 'edit payload carries returned');
select t_assert((save_my_recipe((select v from ids where k = 'a_sub'), t_data(), true) ->> 'status') = 'in_review', 'resubmit');
select t_assert((select not returned and review_note is null from my_recipes() where id = (select v from ids where k = 'a_sub')), 'review state reset');
reset role;
-- A rejected-then-resubmitted recipe can be approved again; a rejected draft cannot be approved while it is a draft.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ad', true);
set local role authenticated;
select t_assert(admin_set_review(array[:'s_sub'], 'rejected', 'again') = 1, 'reject again');
select t_assert(admin_set_review(array[:'s_sub'], 'approved') = 0, 'rejected draft cannot be approved');
reset role;
do $$ begin raise notice 'ok: 8 approve, edit-after-publish, reject, resubmit'; end $$;

-- ===== 9. withdraw and delete ============================================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
insert into ids select 'a_w', (save_my_recipe(null, t_data() || jsonb_build_object('title', 'Withdraw me'), true) ->> 'id')::uuid;
select t_assert((select status = 'in_review' from recipes where id = (select v from ids where k = 'a_w')), 'submitted');
select withdraw_my_recipe((select v from ids where k = 'a_w'));
select t_assert((select status = 'draft' from recipes where id = (select v from ids where k = 'a_w')), 'withdrawn');
select t_expect(format($q$select withdraw_my_recipe(%L)$q$, (select v from ids where k = 'a_w')), 'P0002');  -- not in review any more
select delete_my_recipe((select v from ids where k = 'a_w'));
reset role;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_w')), 'deleted');
select t_assert((select count(*) = 0 from recipe_steps where recipe_id = (select v from ids where k = 'a_w')), 'steps cascaded');
select t_assert((select count(*) = 0 from recipe_ingredients where recipe_id = (select v from ids where k = 'a_w')), 'ingredients cascaded');

-- Deleting a PUBLISHED recipe of your own is allowed (a takedown, not a publication).
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ad', true);
set local role authenticated;
select admin_set_review(array[:'s_sub'], 'unreviewed');
reset role;
select t_assert((select status = 'in_review' from recipes where id = (select v from ids where k = 'a_sub')), 'undoing an approval pulls the user recipe back to in_review');
set local role anon;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_sub')), 'un-approved user recipe is not public');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000ad', true);
set local role authenticated;
select admin_set_review(array[:'s_sub'], 'approved');
reset role;
select t_assert((select status = 'published' from recipes where id = (select v from ids where k = 'a_sub')), 'republished');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select t_expect(format($q$select withdraw_my_recipe(%L)$q$, (select v from ids where k = 'a_sub')), 'P0002');
select delete_my_recipe((select v from ids where k = 'a_sub'));
reset role;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'a_sub')), 'published recipe deleted by its author');
-- Imported recipes are not deletable through this door.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select t_expect(format($q$select delete_my_recipe(%L)$q$, (select id from recipes where author_id is null limit 1)), 'P0002');
select t_expect(format($q$select save_my_recipe(%L, t_data(), false)$q$, (select id from recipes where author_id is null limit 1)), 'P0002');
reset role;
do $$ begin raise notice 'ok: 9 withdraw and delete'; end $$;

-- ===== 10. allergens are derived, never supplied ==============================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
insert into ids select 'a_alg', (save_my_recipe(null, t_data() || jsonb_build_object('title', 'Soy test',
   'ingredients', jsonb_build_array(jsonb_build_object('name', 'soy sauce')), 'allergens', jsonb_build_array(1, 2, 3)), false) ->> 'id')::uuid;
reset role;
select t_assert((select count(*) >= 1 from recipe_allergens ra join allergens a on a.id = ra.allergen_id
                  where ra.recipe_id = (select v from ids where k = 'a_alg') and a.name = 'Soy'), 'soy derived from soy sauce');
select t_assert((select count(*) = (select count(distinct ia.allergen_id) from ingredient_allergens ia
                                    where ia.ingredient_id = (select ingredient_id from resolve_ingredient('soy sauce') limit 1))
                   from recipe_allergens where recipe_id = (select v from ids where k = 'a_alg')), 'allergens = exactly the ingredient allergens');
do $$ begin raise notice 'ok: 10 allergens derived'; end $$;

-- ===== 11. caps =============================================================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);
set local role authenticated;
do $$
begin
  for i in 1..10 loop
    perform save_my_recipe(null, t_data() || jsonb_build_object('title', 'Queued ' || i), true);
  end loop;
end $$;
select t_expect($q$select save_my_recipe(null, t_data(), true)$q$, '22023');          -- 11th in review
select t_assert((save_my_recipe(null, t_data() || jsonb_build_object('title', 'Still can draft'), false) ->> 'status') = 'draft', 'drafts still allowed at the review cap');
do $$
begin
  for i in 1..39 loop
    perform save_my_recipe(null, t_data() || jsonb_build_object('title', 'Draft ' || i), false);
  end loop;
end $$;
select t_assert((select count(*) = 50 from my_recipes()), '50 recipes held');
select t_expect($q$select save_my_recipe(null, t_data(), false)$q$, '22023');          -- 51st
reset role;
do $$ begin raise notice 'ok: 11 caps'; end $$;

-- ===== 12. account deletion removes the person's recipes ===========================================
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d4', true);
set local role authenticated;
insert into ids select 'd_r', (save_my_recipe(null, t_data() || jsonb_build_object('title', 'Doomed'), true) ->> 'id')::uuid;
select delete_my_account();
reset role;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'd_r')), 'recipe removed with account');
select t_assert((select count(*) = 0 from recipes where author_id is null and source_name = 'User submission'), 'no orphaned user recipes');
do $$ begin raise notice 'ok: 12 account deletion'; end $$;

-- ===== 13. the public catalog is unchanged =======================================================
select t_assert((select count(*) = :imported_recipes from recipes where author_id is null), 'imported recipe count unchanged');
select t_assert((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname in ('save_my_recipe','delete_my_recipe','withdraw_my_recipe','my_recipes','my_recipe_for_edit')
                    and (not p.prosecdef or p.proconfig is null or not ('search_path=public, pg_temp' = any (p.proconfig)))),
                'all author RPCs are SECURITY DEFINER with a pinned search_path');
select t_assert((select not has_function_privilege('anon', 'save_my_recipe(uuid,jsonb,boolean)', 'execute')), 'anon cannot execute save_my_recipe');
select t_assert((select not has_function_privilege('authenticated', 'user_recipe_text(text,text,integer,integer,boolean)', 'execute')), 'helpers not callable');

-- ===== 14. the feature switch gates every author RPC =================================================
update feature_flags set enabled = false where name = 'user_recipes';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
set local role authenticated;
select t_expect($q$select save_my_recipe(null, t_data(), true)$q$, '42501');
select t_expect($q$select my_recipes()$q$, '42501');
select t_expect($q$select my_recipe_for_edit(gen_random_uuid())$q$, '42501');
select t_expect($q$select delete_my_recipe(gen_random_uuid())$q$, '42501');
select t_expect($q$select withdraw_my_recipe(gen_random_uuid())$q$, '42501');
select t_expect($q$select private.save_my_recipe(null, t_data(), true)$q$, '42501');   -- no schema access
select t_expect($q$select feature_enabled('user_recipes')$q$, '42501');
select t_expect($q$select * from feature_flags$q$, '42501');
reset role;
update feature_flags set enabled = true where name = 'user_recipes';
select t_assert((select not has_schema_privilege('authenticated', 'private', 'usage')), 'private schema not usable by API roles');
select t_assert((select not has_function_privilege('authenticated', 'private.save_my_recipe(uuid,jsonb,boolean)', 'execute')), 'impl not executable');
select t_assert((select not has_table_privilege('anon', 'feature_flags', 'select')), 'flags table closed');
select t_assert(user_recipe_text('a' || chr(8203) || chr(8238) || chr(65279) || 'b', 't', 1, 10) = 'ab', 'zero-width and bidi characters stripped');
do $$ begin raise notice 'ok: 14 feature switch'; end $$;

-- ===== 15. draft autosave (M5.2): autosave_my_recipe ===================================================
-- Needs 20261023200000_autosave_my_recipe. Two more people: e (the author) and b (another signed-in user).
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000e5', 'e@test.invalid') on conflict do nothing;
insert into profiles (id) values ('00000000-0000-4000-8000-0000000000e5') on conflict do nothing;

-- 15a. closed to anon and while the switch is off
set local role anon;
select t_expect($q$select autosave_my_recipe(null, t_data())$q$, '42501');
reset role;
update feature_flags set enabled = false where name = 'user_recipes';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
select t_expect($q$select autosave_my_recipe(null, t_data())$q$, '42501');
reset role;
update feature_flags set enabled = true where name = 'user_recipes';

-- 15b. the first autosave creates the draft; later ones update the same row
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
insert into ids select 'e_auto', (autosave_my_recipe(null, jsonb_build_object('title', 'Auto soup', 'servings', '4')) ->> 'id')::uuid;
select t_assert((autosave_my_recipe((select v from ids where k = 'e_auto'), jsonb_build_object('title', 'Auto soup two', 'servings', '4')) ->> 'id')::uuid
                = (select v from ids where k = 'e_auto'), 'second autosave updates the same recipe');
reset role;
select t_assert((select status = 'draft' and title = 'Auto soup two' and author_id = '00000000-0000-4000-8000-0000000000e5'
                   from recipes where id = (select v from ids where k = 'e_auto')), 'autosaved draft shape');
select t_assert((select count(*) = 1 from recipes where author_id = '00000000-0000-4000-8000-0000000000e5'), 'still one recipe after two autosaves');
select t_assert((select count(*) = 0 from recipe_ingredients where recipe_id = (select v from ids where k = 'e_auto')), 'an empty draft has no lines');

-- 15c. half-typed lines are left out and counted, never stored unresolved; the rest is kept
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
select t_assert((autosave_my_recipe((select v from ids where k = 'e_auto'), t_data() || jsonb_build_object('title', 'Auto soup three',
  'ingredients', jsonb_build_array(
    jsonb_build_object('quantity', '2', 'unit', 'Tablespoons', 'name', 'green onion'),          -- valid
    jsonb_build_object('quantity', 1, 'unit', '', 'name', 'zzqx not a food'),                    -- unknown ingredient
    jsonb_build_object('quantity', 'not a number', 'unit', '', 'name', 'egg'),                   -- bad amount
    jsonb_build_object('quantity', 1, 'unit', 'blorps', 'name', 'egg'),                          -- unknown unit
    jsonb_build_object('quantity', '3', 'unit', '', 'name', ''),                                 -- amount but no name yet
    jsonb_build_object('quantity', '', 'unit', '', 'name', ''))))                                -- fully blank: nothing
  ->> 'skipped')::int = 4, 'four half-typed lines reported as skipped');
reset role;
select t_assert((select count(*) = 1 from recipe_ingredients where recipe_id = (select v from ids where k = 'e_auto')), 'only the valid line was stored');
select t_assert((select ingredient_id = (select ingredient_id from resolve_ingredient('scallion') limit 1)
                   from recipe_ingredients where recipe_id = (select v from ids where k = 'e_auto')), 'valid line resolved to the canonical ingredient');
select t_assert((select count(*) = 2 from recipe_steps where recipe_id = (select v from ids where k = 'e_auto')), 'steps stored');

-- 15d. autosave never submits, even when the payload says the rights were confirmed
select t_assert((select status = 'draft' from recipes where id = (select v from ids where k = 'e_auto')), 'still a draft after autosave with rights_confirmed true');

-- 15e. a title and servings are still required (nothing to open a draft on)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
select t_expect($q$select autosave_my_recipe(null, jsonb_build_object('title', 'ab', 'servings', '4'))$q$, '22023', 'title');
select t_expect($q$select autosave_my_recipe(null, jsonb_build_object('title', '', 'servings', '4'))$q$, '22023', 'title');
select t_expect($q$select autosave_my_recipe(null, jsonb_build_object('title', 'Fine title', 'servings', ''))$q$, '22023', 'servings');
reset role;
select t_assert((select count(*) = 1 from recipes where author_id = '00000000-0000-4000-8000-0000000000e5'), 'refused autosaves created nothing');

-- 15f. another signed-in user can neither write nor see the draft
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
set local role authenticated;
select t_expect(format($q$select autosave_my_recipe(%L, t_data())$q$, (select v from ids where k = 'e_auto')), 'P0002');
select t_assert(my_recipe_for_edit((select v from ids where k = 'e_auto')) is null, 'another author cannot open the draft for edit');
select t_assert((select count(*) = 0 from my_recipes() where id = (select v from ids where k = 'e_auto')), 'the draft is not in another author''s list');
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'e_auto')), 'the draft is invisible to another author by direct select');
reset role;
set local role anon;
select t_assert((select count(*) = 0 from recipes where id = (select v from ids where k = 'e_auto')), 'the draft is invisible to anon');
reset role;
select t_assert((select title = 'Auto soup three' from recipes where id = (select v from ids where k = 'e_auto')), 'the refused write changed nothing');

-- 15g. nothing but a draft autosaves: in review, published and imported recipes are refused and left alone
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
insert into ids select 'e_rev', (save_my_recipe(null, t_data() || jsonb_build_object('title', 'Waiting for review'), true) ->> 'id')::uuid;
select t_expect(format($q$select autosave_my_recipe(%L, t_data() || jsonb_build_object('title', 'Changed by autosave'))$q$, (select v from ids where k = 'e_rev')),
                '22023', 'not_draft');
reset role;
select t_assert((select status = 'in_review' and title = 'Waiting for review' from recipes where id = (select v from ids where k = 'e_rev')),
                'an in-review recipe is untouched by a refused autosave');
update recipes set status = 'published', published_at = now() where id = (select v from ids where k = 'e_rev');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
select t_expect(format($q$select autosave_my_recipe(%L, t_data() || jsonb_build_object('title', 'Changed by autosave'))$q$, (select v from ids where k = 'e_rev')),
                '22023', 'not_draft');
select t_expect(format($q$select autosave_my_recipe(%L, t_data())$q$, (select id from recipes where author_id is null limit 1)), 'P0002');
reset role;
select t_assert((select status = 'published' and title = 'Waiting for review' from recipes where id = (select v from ids where k = 'e_rev')),
                'a published recipe is not demoted or edited by autosave');

-- 15h. caps still hold (autosave goes through save_my_recipe)
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e5', true);
set local role authenticated;
do $$
begin
  for i in 1..48 loop
    perform autosave_my_recipe(null, jsonb_build_object('title', 'Cap draft ' || i, 'servings', 2));
  end loop;
end $$;
select t_assert((select count(*) = 50 from my_recipes()), '50 recipes held');
select t_expect($q$select autosave_my_recipe(null, jsonb_build_object('title', 'One too many', 'servings', 2))$q$, '22023');
reset role;
do $$ begin raise notice 'ok: 15 draft autosave'; end $$;

do $$ begin raise notice 'ALL PASSED'; end $$;
rollback;
