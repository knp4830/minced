-- Sanity checks for the wave-10 USDA seeds. Read-only. Run against a database that has the migrations + seeds:
--   python -I scripts/nutrition/_dbq.py <container> scripts/nutrition/check_usda_seeds.sql
-- Every query should return 0 rows / the stated expectation.

\echo '1. default foods that cannot contribute energy (expect 0 rows)'
select i.canonical_name, f.form, f.fdc_id, u.description
from ingredient_foods f join ingredients i on i.id = f.ingredient_id join usda_foods u on u.fdc_id = f.fdc_id
where f.is_default and not food_has_nutrition(f.fdc_id)
order by 1;

\echo '2. an ingredient+form with no default food, or more than one (expect 0 rows)'
select i.canonical_name, f.form, count(*) filter (where f.is_default) as defaults
from ingredient_foods f join ingredients i on i.id = f.ingredient_id
group by 1, 2 having count(*) filter (where f.is_default) <> 1;

\echo '3. default foods reporting fewer than 15 of the 35 tracked nutrients (sparse records; each makes micros "not enough data")'
select i.canonical_name, f.form, f.fdc_id, left(u.description, 60) as food, count(n.*) as reported
from ingredient_foods f join ingredients i on i.id = f.ingredient_id join usda_foods u on u.fdc_id = f.fdc_id
left join usda_food_nutrients n on n.fdc_id = f.fdc_id and n.nutrient_id <= 35
where f.is_default
group by 1, 2, 3, 4 having count(n.*) < 15
order by reported, 1;

\echo '4. Atwater check: energy more than 25 percent away from 4P + 4C + 9F in a default food (alcohol/fibre can explain a few)'
select i.canonical_name, f.fdc_id, round(e.v) as kcal, round(4 * p.v + 4 * c.v + 9 * t.v) as atwater
from ingredient_foods f join ingredients i on i.id = f.ingredient_id
join lateral (select amount_per_100g v from usda_food_nutrients where fdc_id = f.fdc_id and nutrient_id = 1) e on true
join lateral (select amount_per_100g v from usda_food_nutrients where fdc_id = f.fdc_id and nutrient_id = 2) p on true
join lateral (select amount_per_100g v from usda_food_nutrients where fdc_id = f.fdc_id and nutrient_id = 3) c on true
join lateral (select amount_per_100g v from usda_food_nutrients where fdc_id = f.fdc_id and nutrient_id = 7) t on true
where f.is_default and e.v > 30 and abs(e.v - (4 * p.v + 4 * c.v + 9 * t.v)) / e.v > 0.25
order by abs(e.v - (4 * p.v + 4 * c.v + 9 * t.v)) desc;

\echo '5. counts'
select (select count(*) from usda_foods) as foods,
       (select count(*) from usda_foods where data_type = 'sr_legacy') as sr_legacy,
       (select count(*) from usda_foods where data_type = 'foundation') as foundation,
       (select count(*) from usda_foods where data_type = 'branded') as branded,
       (select count(*) from usda_food_nutrients) as nutrient_rows,
       (select count(distinct ingredient_id) from ingredient_foods where is_default and form = 'default') as ingredients_with_food,
       (select count(*) from ingredient_portions) as portions;
