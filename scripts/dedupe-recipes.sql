-- Merge duplicate-title recipes: keep the most complete row of each group, delete the rest.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/dedupe-recipes.sql                # does it
--   psql "$URL" -v ON_ERROR_STOP=1 -v dry_run=1 -f scripts/dedupe-recipes.sql   # reports, then ROLLBACK
--
-- DESTRUCTIVE. Take a backup first (pg_dump of the live database). Test on a
-- snapshot, never develop against live.
--
-- GROUP    recipes with the same lower(btrim(title)). The USDA MyPlate import
--          produced 18 such groups (37 rows -> 18), e.g. "Fried Rice" twice under
--          different slugs; the rule below applies to any group, current or future.
-- SURVIVOR highest completeness score, then the slug that equals the slugified title, then no trailing -0 / 1
--          import suffix, then shortest slug, then alphabetical:
--            + 1 per ingredient row, + 1 per step
--            + 5 if any time is known (prep or cook)
--            + 3 if it has a cuisine
--            + 2 if it has a photo
--            + 1 per known nutrition value (calories, protein, carbs, fat, sodium, fiber)
--            + 1 if it has a description
-- DELETES  everything else, in the group. recipe_ingredients, recipe_steps,
--          recipe_allergens, recipe_diets, recipe_cookware and favorites all
--          reference recipes ON DELETE CASCADE, so no orphans are left.
--          Favorites are first re-pointed at the survivor (so a user who saved the
--          deleted copy keeps a favorite) unless they already favourited the survivor.
-- IDEMPOTENT: a second run finds no duplicate groups and changes nothing.
-- NOT DONE HERE: old slugs become 404s. There is no redirect table; if the site
--          has been public long enough for links to matter, add redirects first.

begin;

create temp table dd_scored on commit drop as
select
  r.id, r.slug, lower(btrim(r.title)) as grp,
  ( (select count(*) from recipe_ingredients x where x.recipe_id = r.id)
  + (select count(*) from recipe_steps x where x.recipe_id = r.id)
  + case when coalesce(r.prep_time_min, 0) + coalesce(r.cook_time_min, 0) > 0 then 5 else 0 end
  + case when r.cuisine_id is not null then 3 else 0 end
  + case when r.image_url is not null then 2 else 0 end
  + (r.calories is not null)::int + (r.protein_g is not null)::int + (r.carbs_g is not null)::int
  + (r.fat_g is not null)::int + (r.sodium_mg is not null)::int + (r.fiber_g is not null)::int
  + case when r.description is not null then 1 else 0 end
  ) as score,
  trim(both '-' from regexp_replace(lower(r.title), '[^a-z0-9]+', '-', 'g')) as title_slug,
  (r.slug ~ '(-[0-9]+|[0-9]+)$')::int as has_import_suffix
from recipes r;

create temp table dd_plan on commit drop as
select s.id, s.slug, s.grp, s.score,
       row_number() over (partition by s.grp
                          order by s.score desc, (s.slug <> s.title_slug)::int, s.has_import_suffix, length(s.slug), s.slug) as rnk,
       count(*) over (partition by s.grp) as grp_size
from dd_scored s;

delete from dd_plan where grp_size = 1;   -- not a duplicate group

select count(*) as recipes_before from recipes \gset
select count(distinct grp) as duplicate_groups, count(*) filter (where rnk > 1) as rows_to_delete from dd_plan \gset

\echo 'recipes before:' :recipes_before ' duplicate groups:' :duplicate_groups ' rows to delete:' :rows_to_delete

-- What will happen, per group (kept first).
select grp as title, slug, score, case when rnk = 1 then 'KEEP' else 'delete' end as action
from dd_plan order by grp, rnk;

-- Favorites follow the survivor.
insert into favorites (user_id, recipe_id, created_at)
select f.user_id, k.id, f.created_at
from   favorites f
join   dd_plan d on d.id = f.recipe_id and d.rnk > 1
join   dd_plan k on k.grp = d.grp and k.rnk = 1
on conflict (user_id, recipe_id) do nothing;

delete from recipes where id in (select id from dd_plan where rnk > 1);

select count(*) as recipes_after from recipes \gset
select count(*) as dup_groups_left from (
  select 1 from recipes group by lower(btrim(title)) having count(*) > 1) g \gset

\echo 'recipes after:' :recipes_after ' duplicate groups left:' :dup_groups_left
select (:recipes_before - :recipes_after) = :rows_to_delete as deleted_exactly_the_plan,
       :dup_groups_left = 0                                  as no_duplicates_left;

-- Orphan check: cascades should have removed every child row.
select (select count(*) from recipe_ingredients ri where not exists (select 1 from recipes r where r.id = ri.recipe_id)) as orphan_ingredients,
       (select count(*) from recipe_steps s where not exists (select 1 from recipes r where r.id = s.recipe_id))        as orphan_steps;

\if :{?dry_run}
  \echo 'dry_run set: rolling back'
  rollback;
\else
  commit;
\endif
