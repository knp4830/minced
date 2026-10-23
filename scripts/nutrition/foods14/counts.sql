select 'usda_foods', count(*) from usda_foods union all select 'usda_food_nutrients', count(*) from usda_food_nutrients union all select 'ingredient_foods', count(*) from ingredient_foods
union all select 'ingredient_portions', count(*) from ingredient_portions union all select 'ingredients_with_food', count(distinct ingredient_id) from ingredient_foods
union all select 'added_sugar_ingredients', count(*) from added_sugar_ingredients union all select 'defaults', count(*) from ingredient_foods where is_default
union all select 'stand_ins', count(*) from ingredient_foods where is_proxy;
