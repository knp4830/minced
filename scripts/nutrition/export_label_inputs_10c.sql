-- Wave 10c: everything buildLabel() needs for every published recipe, as one JSON document, so
-- scripts/test-label-coherence-10c.mts can check the label invariants over the whole catalog.
--   psql "$URL" -At -f scripts/nutrition/export_label_inputs_10c.sql > label-inputs.json
-- Read-only.
select json_build_object(
  'nutrients', (select json_agg(json_build_object('id', n.id, 'key', n.key, 'name', n.name, 'unit', n.unit, 'fdc_number', n.fdc_number,
                                                  'dv_amount', n.dv_amount, 'dv_unit', n.dv_unit, 'display_group', n.display_group, 'sort', n.sort) order by n.sort)
                  from nutrients n),
  'recipes', (select json_agg(json_build_object(
      'slug', r.slug, 'title', r.title, 'status', r.nutrition_status, 'source', r.nutrition_source, 'kcal_delta', r.nutrition_kcal_delta,
      'gaps', r.nutrition_gaps,
      'cols', json_build_object('calories', r.calories, 'proteinG', r.protein_g, 'carbsG', r.carbs_g, 'fatG', r.fat_g,
                                'fiberG', r.fiber_g, 'sodiumMg', r.sodium_mg),
      'rows', (select json_agg(json_build_object('nutrient_id', rn.nutrient_id, 'amount', rn.amount_per_serving, 'coverage', rn.coverage))
                 from recipe_nutrients rn where rn.recipe_id = r.id))
      order by r.slug)
    from recipes r where r.status = 'published')
);
