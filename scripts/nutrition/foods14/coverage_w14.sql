-- Wave 14: coverage per nutrient, measured the way the app reads it (food_nutrient_amount: the stored per-100 g row, else the declared conversion).
--   docker exec -i <container> psql -U postgres -At -F '|' -f - < scripts/nutrition/foods14/coverage_w14.sql
-- foods : distinct foods that are the default of some ingredient form (percent carrying the nutrient)
-- lines : published + in_review recipe lines whose ingredient has a default food (percent of those lines whose food carries the nutrient)
-- A missing value is "not reported" (NULL), never 0.
\echo nutrient|foods_with|foods_total|foods_pct|lines_with|lines_total|lines_pct
with f as (select distinct fdc_id from ingredient_foods where is_default),
l as (select ri.id, d.fdc_id from recipe_ingredients ri
        join recipes r on r.id = ri.recipe_id and r.status in ('published', 'in_review')
        join ingredient_foods d on d.ingredient_id = ri.ingredient_id and d.is_default and d.form = 'default'),
fl as (select fdc_id, count(*) n from l group by fdc_id)
select n.key,
  count(*) filter (where food_nutrient_amount(f.fdc_id, n.id, null) is not null),
  count(*),
  round(100.0 * count(*) filter (where food_nutrient_amount(f.fdc_id, n.id, null) is not null) / count(*), 1),
  coalesce(sum(fl.n) filter (where food_nutrient_amount(f.fdc_id, n.id, null) is not null), 0),
  coalesce(sum(fl.n), 0),
  round(100.0 * coalesce(sum(fl.n) filter (where food_nutrient_amount(f.fdc_id, n.id, null) is not null), 0) / nullif(sum(fl.n), 0), 1)
from nutrients n cross join f left join fl using (fdc_id)
where n.id <= 35
group by n.sort, n.key order by n.sort;
