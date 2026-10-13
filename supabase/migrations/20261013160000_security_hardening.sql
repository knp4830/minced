-- Wave 5+6 review fixes (security).
--
-- 1. Recipe catalog is operator-written only. The initial RLS migration let ANY signed-in
--    account INSERT/UPDATE/DELETE recipes (and their steps/ingredients/diets/cookware) as long
--    as author_id = auth.uid(). Nothing limited status, has_photo, image_url or source_*, so a
--    stranger could publish spam, forge provenance and un-reject a moderated recipe. The app has
--    no submission UI, so the author-write surface is dropped entirely (policies AND grants).
--    When submissions are built: INSERT with check (status = 'draft'), column-level grants, and
--    publishing only through an admin RPC. Admin RPCs are SECURITY DEFINER and are unaffected;
--    imports use the secret key / table owner and are unaffected.
-- 2. profiles are readable by their owner only (was: everyone, exposing id, username, created_at).
-- 3. Table grants: nobody via the API needs TRUNCATE/REFERENCES/TRIGGER, and anon never writes.
--    user_cookware kept UPDATE for authenticated (revoke order); fixed.
-- 4. Trigger functions pin search_path and are not callable through the API.
--
-- Non-superuser safe: only DROP POLICY, CREATE POLICY, REVOKE/GRANT on objects this role owns,
-- ALTER FUNCTION ... SET search_path. No SET of extension parameters.

begin;

-- 1. author write policies --------------------------------------------------
drop policy if exists "authors create their own recipes" on recipes;
drop policy if exists "authors update their own recipes" on recipes;
drop policy if exists "authors delete their own recipes" on recipes;
drop policy if exists "authors write their own steps" on recipe_steps;
drop policy if exists "authors write their own recipe ingredients" on recipe_ingredients;
drop policy if exists "authors write their own diet tags" on recipe_diets;
drop policy if exists "authors write their own cookware" on recipe_cookware;

revoke insert, update, delete on
  recipes, recipe_steps, recipe_ingredients, recipe_diets, recipe_cookware
  from anon, authenticated;

-- 2. profiles ---------------------------------------------------------------
drop policy if exists "profiles are publicly readable" on profiles;
create policy "users read their own profile" on profiles
  for select to authenticated
  using (id = (select auth.uid()));

-- 3. grants -------------------------------------------------------------------
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;

revoke all on user_cookware from authenticated;
grant select, insert, delete on user_cookware to authenticated;

-- New tables created by this role no longer get blanket API privileges by default.
alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon;

-- 4. trigger functions --------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

commit;
