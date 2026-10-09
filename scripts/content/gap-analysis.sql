-- Catalog gap analysis. Read-only: run it against a snapshot (or live) to see
-- where the catalog is thin. Used for the wave-1 content lane; re-run it after
-- any bulk import to see whether the gaps moved.
--
--   docker exec -i <container> psql -U postgres -f - < scripts/content/gap-analysis.sql

\echo '=== 1. Recipes by source ==='
select source_name, status, count(*) as recipes from recipes group by 1, 2 order by 3 desc;

\echo '=== 2. Cuisine distribution (published) ==='
select coalesce(c.name, '(no cuisine)') as cuisine, count(*) as recipes,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from recipes r left join cuisines c on c.id = r.cuisine_id
where r.status = 'published'
group by 1 order by 2 desc;

\echo '=== 3. Diet tag coverage ==='
select d.name as diet, count(distinct rd.recipe_id) as tagged_recipes,
       round(100.0 * count(distinct rd.recipe_id) / (select count(*) from recipes where status = 'published'), 1) as pct_of_catalog
from diets d left join recipe_diets rd on rd.diet_id = d.id
group by d.name order by 2 desc;

\echo '=== 4. Allergen coverage ==='
select
  (select count(*) from recipes where status = 'published')                        as published,
  (select count(distinct recipe_id) from recipe_allergens)                          as with_any_allergen,
  (select count(*) from ingredient_allergens)                                       as ingredient_allergen_rows,
  (select count(*) from ingredients)                                                as ingredients;

\echo '=== 5. Ingredient diversity ==='
select
  (select count(*) from ingredients)                                                as vocabulary,
  (select count(distinct ingredient_id) from recipe_ingredients)                    as used_by_any_recipe,
  (select count(*) from ingredients i
     where not exists (select 1 from recipe_ingredients ri where ri.ingredient_id = i.id)) as never_used,
  (select count(*) from (select ingredient_id from recipe_ingredients
                         group by 1 having count(distinct recipe_id) = 1) s)        as used_by_exactly_one_recipe;

\echo '=== 6. Most-used ingredients (the catalog is dominated by these) ==='
select i.canonical_name, count(distinct ri.recipe_id) as recipes
from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id
group by 1 order by 2 desc limit 12;

\echo '=== 7. Spice-level distribution ==='
select coalesce(spice_level::text, 'NULL') as spice_level, count(*) from recipes group by 1 order by 1;

\echo '=== 8. Nutrition and cost coverage ==='
select count(*) as recipes,
       count(calories) as with_calories,
       count(cost_per_serving) as with_cost,
       count(image_url) as with_image
from recipes;
