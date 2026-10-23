-- Wave 14: the five largest stored values per nutrient among the foods that are the default of an ingredient form, with the source type.
-- A unit slip in a source (butter 214,286 mg cholesterol) shows up here as a value no food can have; the known physical ceilings are in the comments.
--   docker exec -i <container> psql -U postgres -At -F '|' -f - < scripts/nutrition/foods14/outliers_w14.sql
with d as (select distinct fdc_id from ingredient_foods where is_default),
r as (select n.key, x.fdc_id, x.amount_per_100g v, u.data_type, left(u.description, 40) descr,
             row_number() over (partition by n.id order by x.amount_per_100g desc) rk
        from d join usda_food_nutrients x on x.fdc_id = d.fdc_id join nutrients n on n.id = x.nutrient_id and n.id <= 35 join usda_foods u on u.fdc_id = x.fdc_id)
select key, rk, v, data_type, fdc_id, descr from r where rk <= 3 order by key, rk;
