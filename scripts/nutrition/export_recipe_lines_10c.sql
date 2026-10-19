-- Wave 10c: every USDA MyPlate recipe with its ingredient rows as JSON, for audit_recipe_lines_10c.py.
--   psql "$URL" -At -f scripts/nutrition/export_recipe_lines_10c.sql > db-lines.json
-- Read-only.
select json_agg(x) from (
  select regexp_replace(r.source_url, '^.*/recipes/', '') as slug,
         r.title, r.servings, r.calories, r.protein_g, r.carbs_g, r.fat_g, r.sodium_mg, r.fiber_g,
         r.nutrition_status as st,
         (select json_agg(json_build_object('ord', ri.sort_order, 'ing', i.canonical_name, 'ing_id', ri.ingredient_id,
                                            'q', ri.quantity, 'unit', u.name, 'note', ri.prep_note,
                                            'opt', ri.is_optional, 'fdc', ri.fdc_id, 'aisle', i.aisle_category,
                                            'forms', (select coalesce(json_agg(distinct f.form), '[]'::json) from ingredient_foods f where f.ingredient_id = i.id))
                                            order by ri.sort_order)
            from recipe_ingredients ri
            join ingredients i on i.id = ri.ingredient_id
            left join units u on u.id = ri.unit_id
           where ri.recipe_id = r.id) as lines
    from recipes r
   where r.source_name like 'USDA MyPlate%'
) x;
