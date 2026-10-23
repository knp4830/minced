-- Wave 14: a time filter no longer lets recipes with no stated time through (owner decision).
--
-- Before: a recipe with total_time_min NULL or 0 ("no time stated", most of the MyPlate catalog) PASSED every time
-- filter, so "Under 30 min" returned recipes with no known time. Now, WHEN a time bound is given (min_total_min and/or
-- max_total_min), the recipe must have a known time (> 0) inside the bound. With no bound nothing changes: untimed
-- recipes still show.
--
-- Applies to match_recipes (pantry), search_recipes (search) and fridge_recipes_grouped (fridge). Browse reads the table
-- directly and is changed in src/lib/queries/browse.ts; filtered_recipes takes no time argument.
--
-- Like 20261018150000 this rewrites the stored function text (pg_get_functiondef) so the large bodies are not copied
-- again. Strict: each function must contain exactly one max and one min predicate in the old form, or this aborts.

-- Load pg_trgm in THIS session first (docs/LESSONS.md): the re-created search_recipes carries
-- SET pg_trgm.word_similarity_threshold, which a non-superuser role cannot set unless the extension is loaded.
select similarity('a', 'a');

do $$
declare
  f      record;
  def    text;
  newd   text;
  n_old  int;
  pat    constant text :=
    '\(\s*((?:fridge_recipes_grouped\.)?(?:max|min)_total_min)\s+is null\s+or\s+r\.total_time_min is null\s+or\s+r\.total_time_min = 0\s+or\s+r\.total_time_min (<=|>=) \1\)';
begin
  for f in
    select p.oid, p.proname
    from   pg_proc p
    join   pg_namespace n on n.oid = p.pronamespace
    where  n.nspname = 'public'
      and  p.proname in ('match_recipes', 'search_recipes', 'fridge_recipes_grouped')
  loop
    def := pg_get_functiondef(f.oid);
    select count(*) into n_old from regexp_matches(def, pat, 'g');
    if n_old <> 2 then
      raise exception 'function % has % old time predicates, expected 2; refusing to rewrite', f.proname, n_old;
    end if;
    newd := regexp_replace(
              def, pat,
              '(\1 is null or (r.total_time_min > 0 and r.total_time_min \2 \1))',
              'g');
    if newd = def then
      raise exception 'function % was not changed', f.proname;
    end if;
    execute newd;
  end loop;
end $$;
