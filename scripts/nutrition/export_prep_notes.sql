select json_object_agg(name, notes) from (
select i.canonical_name as name, (select json_agg(t) from (select coalesce(ri.prep_note,'') n, coalesce(ri.quantity::text,'-')||' '||coalesce(u.name,'each') q, count(*) c from recipe_ingredients ri left join units u on u.id=ri.unit_id where ri.ingredient_id=i.id group by 1,2 order by 3 desc limit 6) t) notes
from ingredients i where exists (select 1 from recipe_ingredients x where x.ingredient_id=i.id)) z;
