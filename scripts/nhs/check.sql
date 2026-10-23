-- Checks for the wave 14 NHS recipes (run on the throwaway snapshot after seed-recipes-w14-nhs.sql).
select slug, status, servings, round(calories) as kcal, round(protein_g) as p, round(carbs_g) as c, round(fat_g) as f,
       nutrition_status, coalesce(array_to_string(nutrition_gaps, '; '), '') as gaps
from recipes where source_license like 'Contains public sector information%' order by slug;
