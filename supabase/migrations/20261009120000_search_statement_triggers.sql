-- M3.5 prerequisite -- stop rewriting a recipe once per ingredient row.
--
-- THE PROBLEM (measured, see LEARNING-LOG / the wave-1 search report)
--
--   The M1.2 trigger `recipe_ingredients_touch_recipe` is FOR EACH ROW. It runs
--   `update recipes set updated_at = now()` so that the BEFORE trigger on
--   `recipes` recomputes search_vector. A recipe with 9 ingredients therefore
--   gets rewritten 9 times when its ingredients are inserted, and the whole
--   import transaction does it again on a re-import (delete 9 + insert 9).
--
--   Postgres never edits a row in place (MVCC). An UPDATE writes a complete NEW
--   copy of the row and leaves the old copy behind as a "dead tuple" until
--   VACUUM reclaims it. A recipes row is ~2 KB (description, notes, tsvector),
--   so 7,083 ingredient rows -> ~7,000 dead copies -> ~12 MB of garbage in
--   a table whose live data is 2 MB. And because the whole import ran inside
--   ONE transaction, VACUUM was not allowed to clean any of it until commit:
--   the file grew to its peak size, and files never shrink on their own.
--
--   Measured on the live snapshot: importing 200 recipes (1,697 ingredient
--   rows) grew the heap 1,984 kB -> 5,040 kB; 1,697 dead tuples, 8.5 per recipe.
--
-- THE FIX
--
--   Statement-level triggers with TRANSITION TABLES. A transition table is the
--   set of rows a single statement touched, handed to the trigger as if it were
--   a temporary table. The trigger fires once per STATEMENT, and touches each
--   distinct recipe once: a bulk `insert into recipe_ingredients ... select`
--   covering 9 ingredients now costs 1 rewrite instead of 9.
--
--   Semantics are unchanged: after any change to a recipe's ingredients or
--   diets, the recipe row is touched, the BEFORE trigger recomputes
--   search_vector, and updated_at moves. Only the number of rewrites changes.
--
-- Postgres allows one event per trigger when transition tables are used, so
-- each child table gets three triggers (insert / update / delete).

begin;

drop trigger if exists recipe_ingredients_touch_recipe on recipe_ingredients;
drop trigger if exists recipe_diets_touch_recipe       on recipe_diets;
drop function if exists trg_touch_parent_recipe();

-- One function per event because the transition-table names differ by event:
-- INSERT only has NEW TABLE, DELETE only has OLD TABLE, UPDATE has both. The
-- functions only read `recipe_id`, which both child tables share, so the same
-- three functions serve recipe_ingredients and recipe_diets.

create or replace function trg_touch_recipes_after_insert()
returns trigger
language plpgsql
as $$
begin
  update recipes
     set updated_at = now()
   where id in (select distinct recipe_id from new_rows);
  return null;
end;
$$;

create or replace function trg_touch_recipes_after_delete()
returns trigger
language plpgsql
as $$
begin
  update recipes
     set updated_at = now()
   where id in (select distinct recipe_id from old_rows);
  return null;
end;
$$;

-- An UPDATE can move a child row between recipes, so both sides are touched.
create or replace function trg_touch_recipes_after_update()
returns trigger
language plpgsql
as $$
begin
  update recipes
     set updated_at = now()
   where id in (
     select recipe_id from new_rows
     union
     select recipe_id from old_rows
   );
  return null;
end;
$$;

create trigger recipe_ingredients_touch_after_insert
after insert on recipe_ingredients
referencing new table as new_rows
for each statement execute function trg_touch_recipes_after_insert();

create trigger recipe_ingredients_touch_after_update
after update on recipe_ingredients
referencing old table as old_rows new table as new_rows
for each statement execute function trg_touch_recipes_after_update();

create trigger recipe_ingredients_touch_after_delete
after delete on recipe_ingredients
referencing old table as old_rows
for each statement execute function trg_touch_recipes_after_delete();

create trigger recipe_diets_touch_after_insert
after insert on recipe_diets
referencing new table as new_rows
for each statement execute function trg_touch_recipes_after_insert();

create trigger recipe_diets_touch_after_update
after update on recipe_diets
referencing old table as old_rows new table as new_rows
for each statement execute function trg_touch_recipes_after_update();

create trigger recipe_diets_touch_after_delete
after delete on recipe_diets
referencing old table as old_rows
for each statement execute function trg_touch_recipes_after_delete();

commit;
