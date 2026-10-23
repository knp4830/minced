-- Wave 14: recipes that use an ingredient whose default food was upgraded, with their computed calories and status (run on the container before and after the seed to compare).
select i.canonical_name, r.slug, r.status, r.nutrition_status, r.calories
from recipe_ingredients ri join recipes r on r.id = ri.recipe_id join ingredients i on i.id = ri.ingredient_id
where i.canonical_name in ('agave syrup','cassava flour','candied ginger','crumpets','dried blueberries','dried cherries','dried pineapple','duck fat','dulce de leche','egg roll wrappers',
  'garri','guacamole','mascarpone','hazelnut spread','pico de gallo','salsa verde','sweet and sour sauce')
order by 1, 2;
