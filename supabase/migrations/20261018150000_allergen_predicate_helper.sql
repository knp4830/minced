-- Wave 10c integration: ONE definition of "this recipe carries one of these allergens".
--
-- Four functions applied the same predicate as copied text: match_recipes, search_recipes, filtered_recipes and
-- (new in 10c) fridge_recipes_grouped. A copy can drift; an allergen filter that disagrees between the browse page, the
-- search box, the pantry matcher and the fridge is a safety bug. This migration adds the single helper and rewrites the
-- predicate in all four to call it.
--
-- Semantics (unchanged): a recipe is excluded when recipe_allergens holds ANY of the slugs. recipe_allergens holds only
-- allergens from REQUIRED lines (optional-only allergens live in recipe_optional_allergens and never hide a recipe).
--
-- The rewrite works on the stored function text (pg_get_functiondef) so the four large bodies are not copied a fifth
-- time. It is strict: each function must contain the old predicate exactly once, or the migration aborts.
-- SQL-language, STABLE, single SELECT: Postgres inlines it, so the plans match the old inline EXISTS.

create or replace function public.recipe_has_allergen(p_recipe_id uuid, p_slugs text[])
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from   public.recipe_allergens ra
    join   public.allergens a on a.id = ra.allergen_id
    where  ra.recipe_id = p_recipe_id
      and  a.slug = any (p_slugs)
  );
$$;

comment on function public.recipe_has_allergen(uuid, text[]) is
  'True when the recipe carries ANY of the allergen slugs through a required ingredient line. The only allergen-exclusion predicate: match_recipes, search_recipes, filtered_recipes and fridge_recipes_grouped all call it.';

grant execute on function public.recipe_has_allergen(uuid, text[]) to anon, authenticated, service_role;

do $$
declare
  f    record;
  def  text;
  newd text;
begin
  for f in
    select p.oid, p.proname
    from   pg_proc p
    join   pg_namespace n on n.oid = p.pronamespace
    where  n.nspname = 'public'
      and  p.proname in ('match_recipes', 'search_recipes', 'filtered_recipes', 'fridge_recipes_grouped')
  loop
    def  := pg_get_functiondef(f.oid);
    newd := regexp_replace(
              def,
              'not exists \(\s*select 1\s+from\s+recipe_allergens ra\s+join\s+allergens a on a\.id = ra\.allergen_id\s+where\s+ra\.recipe_id = r\.id\s+and\s+a\.slug = any \(([a-z_.]+)\)\)',
              'not public.recipe_has_allergen(r.id, \1)',
              'g');
    if (length(newd) - length(replace(newd, 'recipe_has_allergen(r.id', ''))) <> length('recipe_has_allergen(r.id') then
      raise exception 'function % does not contain the allergen predicate exactly once; refusing to rewrite', f.proname;
    end if;
    if newd like '%from   recipe_allergens ra%' then
      raise exception 'function % still has an inline allergen predicate', f.proname;
    end if;
    execute newd;
  end loop;
end $$;
