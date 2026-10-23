select i.canonical_name, f.form, f.fdc_id, u.data_type, left(u.description,40), (select count(distinct ri.recipe_id) from recipe_ingredients ri join recipes r on r.id=ri.recipe_id where ri.ingredient_id=i.id and r.status in ('published','in_review')) recipes, (select count(*) from usda_food_nutrients x where x.fdc_id=f.fdc_id and x.nutrient_id<=35) panel
from ingredient_foods f join ingredients i on i.id=f.ingredient_id join usda_foods u on u.fdc_id=f.fdc_id
where f.is_default and food_nutrient_amount(f.fdc_id, 1::smallint, i.id) is null order by 6 desc, 1;
