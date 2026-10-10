-- Wave 2 / Phase 3 DoD fix -- autocomplete latency.
--
-- suggest_ingredients ran normalize_ingredient_name() (two regexp_replace calls)
-- on all ~1,150 names and aliases on every keystroke: 45 ms in the database,
-- 76-137 ms through PostgREST as anon. The normalised form is now a STORED
-- GENERATED column, computed once at write time and always consistent with the
-- name, and the function reads it. Same signature, same results.

begin;

alter table ingredients
  add column name_norm text
  generated always as (normalize_ingredient_name(canonical_name::text)) stored;

alter table ingredient_aliases
  add column alias_norm text
  generated always as (normalize_ingredient_name(alias::text)) stored;

create or replace function suggest_ingredients(
  prefix      text,
  max_results integer default 8
)
returns table (
  ingredient_id  integer,
  canonical_name citext,
  matched_text   text,
  match_kind     text,
  score          real
)
language sql
stable
parallel safe
as $$
  with q as (
    select normalize_ingredient_name(prefix)                             as p,
           singularize_ingredient_name(normalize_ingredient_name(prefix)) as ps
  ),
  cand as (
    select i.id, i.canonical_name, i.canonical_name::text as txt, 'name'::text as kind,
           i.name_norm as norm
    from   ingredients i
    union all
    select i.id, i.canonical_name, a.alias::text, 'alias', a.alias_norm
    from   ingredient_aliases a
    join   ingredients i on i.id = a.ingredient_id
  ),
  tiered as (
    select c.id, c.canonical_name, c.txt, c.kind, c.norm,
           similarity(c.norm, q.p) as sim,
           case
             when c.norm in (q.p, q.ps)                                   then 0
             when c.norm like q.p || '%' or c.norm like q.ps || '%'       then 1
             when c.norm like '% ' || q.p || '%'
               or c.norm like '% ' || q.ps || '%'                         then 2
             when similarity(c.norm, q.p) >= 0.3                          then 3
           end as tier
    from   q
    cross  join cand c
    where  q.p is not null and c.norm is not null
  ),
  best as (
    select distinct on (t.id)
           t.id, t.canonical_name, t.txt, t.kind, t.tier, t.sim, t.norm
    from   tiered t
    where  t.tier is not null
    order  by t.id, t.tier, case when t.tier = 3 then -t.sim else 0 end,
              (t.kind = 'alias'), length(t.norm), t.sim desc
  )
  select b.id, b.canonical_name, b.txt, b.kind,
         (1.0 - b.tier * 0.2)::real
  from   best b
  order  by b.tier,
            case when b.tier = 3 then -b.sim else 0 end,
            (b.kind = 'alias'), length(b.norm), b.sim desc, b.canonical_name
  limit  least(greatest(max_results, 1), 25);
$$;

commit;
