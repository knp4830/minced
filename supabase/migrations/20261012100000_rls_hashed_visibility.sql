-- Wave 4 / DB performance -- child-table RLS without a function call per row.
--
-- MEASURED PROBLEM. match_recipes reads recipe_ingredients (8,154 rows). Every
-- candidate row evaluated `can_read_recipe(recipe_id)`: a SECURITY DEFINER SQL
-- function, which Postgres cannot inline, so each call is a nested statement
-- with its own executor start-up. One 8-item fridge made 8,089 such calls and
-- cost nearly all of its ~175 ms (the same query as the table owner, who
-- bypasses RLS, is several times faster).
--
-- FIX. Express the same rule as an uncorrelated subquery:
--
--     recipe_id IN (SELECT id FROM recipes)
--
-- A policy qual is evaluated with the caller's own rights, so the inner scan of
-- `recipes` is itself filtered by the recipes policies ("status = published" OR
-- "author_id = auth.uid()"), which is exactly what can_read_recipe() computes.
-- Postgres runs an uncorrelated IN-subquery once, hashes the result and does a
-- hash probe per row instead of a function call per row.
--
-- WHY THE VISIBLE ROWS ARE IDENTICAL.
--   can_read_recipe(id)  = EXISTS (recipes r WHERE r.id = id AND (r.status =
--                          'published' OR r.author_id = auth.uid()))
--   recipes SELECT policies (OR-ed) = status = 'published'  OR  author_id =
--                          auth.uid() (authenticated only; anon has no uid, so
--                          author_id = NULL is never true either way).
-- Same predicate, same caller. No recursion: no recipes policy reads a child
-- table. owns_recipe() likewise becomes "id IN (my recipes)". The functions
-- stay in place (other policies and the test suites still use them).
-- supabase/tests/perf_rls_equivalence_test.sql proves the row sets match for
-- anon, a signed-in non-author and an author, including a draft with children.
--
-- ALTER POLICY changes the expression in place: the policy never disappears,
-- so there is no window in which a table is unprotected.

begin;

-- READ policies: visibility follows the parent recipe.
alter policy "steps follow recipe visibility" on recipe_steps
  using (recipe_id in (select r.id from recipes r));
alter policy "ingredients follow recipe visibility" on recipe_ingredients
  using (recipe_id in (select r.id from recipes r));
alter policy "diet tags follow recipe visibility" on recipe_diets
  using (recipe_id in (select r.id from recipes r));
alter policy "cookware follows recipe visibility" on recipe_cookware
  using (recipe_id in (select r.id from recipes r));
alter policy "allergen cache follows recipe visibility" on recipe_allergens
  using (recipe_id in (select r.id from recipes r));
alter policy "photos follow recipe visibility" on recipe_photos
  using (recipe_id in (select r.id from recipes r));

-- AUTHOR policies are FOR ALL, so they also apply to SELECT and were evaluated
-- first (alphabetical order) for every row. Same rule, hashed.
alter policy "authors write their own steps" on recipe_steps
  using      (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())))
  with check (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())));
alter policy "authors write their own recipe ingredients" on recipe_ingredients
  using      (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())))
  with check (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())));
alter policy "authors write their own diet tags" on recipe_diets
  using      (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())))
  with check (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())));
alter policy "authors write their own cookware" on recipe_cookware
  using      (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())))
  with check (recipe_id in (select r.id from recipes r where r.author_id = (select auth.uid())));

commit;
