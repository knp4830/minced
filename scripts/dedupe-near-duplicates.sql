-- Delete near-duplicate recipes that were reviewed by hand (same dish, different slug/title).
--
--   psql "$URL" -v ON_ERROR_STOP=1 -v dry_run=1 -f scripts/dedupe-near-duplicates.sql   # reports, then ROLLBACK
--   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/dedupe-near-duplicates.sql                # does it
--
-- DESTRUCTIVE. Take a backup first (pg_dump of the live database). Test on a snapshot.
-- Companion to scripts/dedupe-recipes.sql, which only catches IDENTICAL titles; these pairs have different
-- titles, so the list is explicit. Review report: scripts/photos/NEAR-DUPLICATES.md.
--
-- Each row is (loser, keeper): the loser is deleted, the keeper stays.
--   heavenly-deviled-eggs -> deviled-eggs        eggs + mayonnaise (+ mustard or salt/pepper); same dish. Keeper has the fuller steps.
--   tostadas-delgadas     -> tostadas            flour tortillas, refried beans, lettuce, tomato, cheese; same dish. Keeper has more ingredients.
--   scalloped-potatoes-ii -> scalloped-potatoes  potatoes, onion, margarine, flour, milk; same dish. Keeper has times and a photo.
--
-- Handled before the delete:
--   favorites           re-pointed at the keeper (skipped if the user already saved the keeper).
--   shopping_list_items source_recipe_id re-pointed at the keeper (otherwise the FK sets it to NULL and the
--                       "from <recipe>" link is lost; the item itself is never deleted).
--   everything else (ingredients, steps, allergens, diets, cookware, photos, reviews) cascades.
-- IDEMPOTENT: pairs whose loser no longer exists are skipped; a pair whose keeper is missing is NEVER deleted.

begin;

create temp table nd_pairs (loser text primary key, keeper text not null) on commit drop;
insert into nd_pairs (loser, keeper) values
  ('heavenly-deviled-eggs', 'deviled-eggs'),
  ('tostadas-delgadas',     'tostadas'),
  ('scalloped-potatoes-ii', 'scalloped-potatoes');

create temp table nd_plan on commit drop as
select l.id as loser_id, l.slug as loser, k.id as keeper_id, k.slug as keeper
from nd_pairs p
join recipes l on l.slug = p.loser
join recipes k on k.slug = p.keeper;      -- inner join: no keeper, no delete

select count(*) as recipes_before from recipes \gset
select count(*) as rows_to_delete from nd_plan \gset
\echo 'recipes before:' :recipes_before ' rows to delete:' :rows_to_delete

select loser, keeper from nd_plan order by loser;

insert into favorites (user_id, recipe_id, created_at)
select f.user_id, p.keeper_id, f.created_at
from favorites f join nd_plan p on p.loser_id = f.recipe_id
on conflict (user_id, recipe_id) do nothing;

update shopping_list_items s
set    source_recipe_id = p.keeper_id
from   nd_plan p
where  s.source_recipe_id = p.loser_id;

delete from recipes where id in (select loser_id from nd_plan);

select count(*) as recipes_after from recipes \gset
select (:recipes_before - :recipes_after) = :rows_to_delete as deleted_exactly_the_plan;
select (select count(*) from recipe_ingredients ri where not exists (select 1 from recipes r where r.id = ri.recipe_id)) as orphan_ingredients,
       (select count(*) from recipe_steps s where not exists (select 1 from recipes r where r.id = s.recipe_id))        as orphan_steps,
       (select count(*) from recipes where slug in (select loser from nd_pairs)) as losers_left;

\if :{?dry_run}
  \echo 'dry_run set: rolling back'
  rollback;
\else
  commit;
\endif
