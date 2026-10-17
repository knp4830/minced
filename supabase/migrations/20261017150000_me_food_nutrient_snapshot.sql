-- Wave 10 (UI lane): per-nutrient snapshot on the Me food diary.
--
-- A diary row already freezes calories, protein, carbs, fat, fiber and sodium when a recipe is logged, so a
-- later change to the recipe cannot rewrite history. "All nutrients today" now shows vitamins and minerals
-- too, so the rest of the nutrients are frozen the same way, in one jsonb object keyed by nutrients.key:
--
--   { "calcium_mg": 212.4, "vitamin_c_mg": 18, ... }       totals for the whole entry (per-serving x servings)
--
-- An absent key means "not reported", which is not zero. NULL means the row predates nutrient data or is a
-- quick add (macros only). The server writes this from compute_nutrients() / recipe_nutrients; the browser
-- never sends it. Nothing here widens access: the row keeps its owner-only policies, and a person who edits
-- their own jsonb only changes their own diary.
--
-- The column is optional on purpose, so this migration is independent of the nutrition tables and can be
-- applied before or after them.

begin;

alter table public.me_food_log
  add column nutrients jsonb
  check (
    nutrients is null
    or (jsonb_typeof(nutrients) = 'object' and pg_column_size(nutrients) <= 4096)
  );

comment on column public.me_food_log.nutrients is
  'Per-nutrient totals for the entry, keyed by nutrients.key, frozen at log time. Absent key = not reported (not zero). NULL = quick add or logged before nutrient data existed.';

commit;
