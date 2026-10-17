select json_agg(x) from (
select i.id, i.canonical_name as name, i.aisle_category as aisle, i.fdc_id, i.density_g_per_ml as dens, i.is_pantry_staple as staple,
 count(ri.*) as rows,
 count(ri.*) filter (where r.status='published') as prows,
 (select json_object_agg(coalesce(u.name,'each'), c) from (select ri2.unit_id, count(*) c from recipe_ingredients ri2 where ri2.ingredient_id=i.id group by 1) z left join units u on u.id=z.unit_id) as units
from ingredients i left join recipe_ingredients ri on ri.ingredient_id=i.id left join recipes r on r.id=ri.recipe_id
group by i.id order by 7 desc, i.canonical_name) x;
