-- Planner cost for search_recipes / match_recipes with several filters exceeds
-- the JIT threshold (100000), so Postgres compiles the query: ~26 ms of JIT for
-- a 2 ms query (measured: skillet + gluten-free search, 23-28 ms warm, ~55 ms cold,
-- 2 ms with jit = off). These are short OLTP lookups; JIT never pays for itself.
-- Function-level setting, so it follows the function and needs no role change.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('search_recipes', 'match_recipes')
  loop
    execute format('alter function %s set jit = off', fn);
  end loop;
end $$;
