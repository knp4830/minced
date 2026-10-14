-- Wave 7: cookware alternatives ("X or Y") count as EITHER.
-- recipe_cookware.alt_group: rows of one recipe with the same non-null value are alternatives.
--   * "uses X" (cookware_slugs)       -> matches ANY member of a group
--   * "only what I own" (owned_...)   -> every requirement needs an owned member; a group is met by
--                                        owning ANY member, ungrouped rows are required individually
-- Checked on match_recipes, search_recipes and makeable_recipes (the browse list), plus the
-- seeded real data when supabase/seed-cookware.sql has been run. Self-contained, rolls back.
--
--   psql "$URL" -v ON_ERROR_STOP=1 -f supabase/tests/cookware_alt_groups_test.sql
--
-- Success prints "cookware alt-group tests passed: N assertions".

begin;

create temp table t_n (n int);
insert into t_n values (0);

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  update t_n set n = n + 1;
end $$;

insert into ingredients (canonical_name, slug, aisle_category) values ('zzaltthing', 'zzaltthing', 'Other');

-- p_spec items: 'slug' (required alone) or 'slug:N' (member of alt group N).
create function pg_temp.mk(p_title text, p_status recipe_status, variadic p_cook text[])
returns uuid language plpgsql as $$
declare rid uuid := gen_random_uuid(); c text; g smallint;
begin
  insert into recipes (id, slug, title, servings, status, published_at, cook_time_min)
  values (rid, 'zz-' || rid, p_title, 2, p_status, case when p_status = 'published' then now() end, 20);
  insert into recipe_ingredients (recipe_id, ingredient_id, sort_order)
  select rid, id, 1 from ingredients where canonical_name = 'zzaltthing';
  foreach c in array p_cook loop
    if c <> '' then
      g := nullif(split_part(c, ':', 2), '')::smallint;
      insert into recipe_cookware (recipe_id, cookware_id, alt_group)
      select rid, id, g from cookware where slug = split_part(c, ':', 1);
    end if;
  end loop;
  return rid;
end $$;

create temp table t_r as
select 'blend'  as k, pg_temp.mk('zzaltunique Blend',  'published', 'blender:1', 'food-processor:1') as id union all
select 'blendpot',    pg_temp.mk('zzaltunique BlendPot','published', 'blender:1', 'food-processor:1', 'pot')  union all
select 'two',         pg_temp.mk('zzaltunique Two',     'published', 'skillet:1', 'griddle:1', 'blender:2', 'food-processor:2') union all
-- the same group number in another recipe is a different group
select 'twin',        pg_temp.mk('zzaltunique Twin',    'published', 'wok:1', 'saucepan:1') union all
-- both halves listed but NOT grouped = both required (the pre-wave-7 behaviour, still valid)
select 'both',        pg_temp.mk('zzaltunique Both',    'published', 'blender', 'food-processor') union all
select 'solo',        pg_temp.mk('zzaltunique Solo',    'published', 'skillet') union all
select 'none',        pg_temp.mk('zzaltunique None',    'published', '') union all
select 'draft',       pg_temp.mk('zzaltunique Draft',   'draft',     'blender:1', 'food-processor:1');

create function pg_temp.mm(owned text[], uses text[] default null) returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}')
  from match_recipes((select array[id] from ingredients where canonical_name = 'zzaltthing'), 5, '{}', 1, 100,
                     cookware_slugs => uses, owned_cookware_slugs => owned) m
  join t_r t on t.id = m.recipe_id $$;

create function pg_temp.ss(owned text[], uses text[] default null) returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}')
  from search_recipes('zzaltunique', cookware_slugs => uses, owned_cookware_slugs => owned, result_limit => 50) s
  join t_r t on t.id = s.id and t.k <> 'draft' $$;  -- tests run as the owner (no RLS): drafts excluded by hand

create function pg_temp.mk_browse(owned text[]) returns text[] language sql as $$
  select coalesce(array_agg(t.k order by t.k), '{}')
  from makeable_recipes(owned) r join t_r t on t.id = r.id and t.k <> 'draft' $$;

do $$
declare
  v_all text[] := array['blend','blendpot','both','none','solo','twin','two'];
  n_grouped int;
begin
  -- match_recipes -----------------------------------------------------------------------------
  perform pg_temp.ok(pg_temp.mm(null) = v_all, 'matcher: NULL = no filter');
  perform pg_temp.ok(pg_temp.mm('{}') = array['none'], 'matcher: owns nothing -> only the no-cookware recipe');
  perform pg_temp.ok(pg_temp.mm(array['blender']) = array['blend','none'],
    'matcher: blender alone makes the blender-or-processor recipe (not the one that also needs a pot, nor "both")');
  perform pg_temp.ok(pg_temp.mm(array['food-processor']) = array['blend','none'],
    'matcher: food processor alone makes it too (either member)');
  perform pg_temp.ok(pg_temp.mm(array['blender','food-processor']) = array['blend','both','none'],
    'matcher: owning both halves also makes the ungrouped "both" recipe');
  perform pg_temp.ok(pg_temp.mm(array['food-processor','pot']) = array['blend','blendpot','none'],
    'matcher: group member + the ungrouped pot makes blendpot');
  perform pg_temp.ok(pg_temp.mm(array['pot']) = array['none'],
    'matcher: the ungrouped pot alone does not satisfy the blender-or-processor group');
  perform pg_temp.ok(pg_temp.mm(array['skillet']) = array['none','solo'],
    'matcher: skillet satisfies group 1 of "two" but not its group 2 (still needs a blender or processor)');
  perform pg_temp.ok(pg_temp.mm(array['griddle','blender']) = array['blend','none','two'],
    'matcher: one member of EACH of two groups makes "two"');
  perform pg_temp.ok(pg_temp.mm(array['skillet','griddle']) = array['none','solo'],
    'matcher: two members of the SAME group do not satisfy the other group');
  perform pg_temp.ok(pg_temp.mm(array['saucepan']) = array['none','twin'],
    'matcher: group 1 of "twin" is its own group (not merged with group 1 of other recipes)');
  perform pg_temp.ok(pg_temp.mm(array['wok']) = array['none','twin'], 'matcher: wok is the other member of twin');
  perform pg_temp.ok(pg_temp.mm(array['no-such-pan']) = array['none'], 'matcher: unknown slug owns nothing real, no error');
  perform pg_temp.ok(pg_temp.mm(array['blender','blender']) = array['blend','none'], 'matcher: duplicate slugs are harmless');

  -- "uses X" matches any member of a group ------------------------------------------------------
  perform pg_temp.ok(pg_temp.mm(null, array['food-processor']) = array['blend','blendpot','both','two'],
    'matcher: uses food-processor -> every recipe with it as a member or requirement');
  perform pg_temp.ok(pg_temp.mm(null, array['griddle']) = array['two'], 'matcher: uses griddle -> the recipe that lists it in a group');
  perform pg_temp.ok(pg_temp.mm(null, array['wok','pot']) = array['blendpot','twin'], 'matcher: uses wok OR pot');
  perform pg_temp.ok(pg_temp.mm(array['blender'], array['food-processor']) = array['blend'],
    'matcher: uses food-processor AND I own only a blender -> the either-or recipe');

  -- search_recipes --------------------------------------------------------------------------------
  perform pg_temp.ok(pg_temp.ss(null) = v_all, 'search: NULL = no filter');
  perform pg_temp.ok(pg_temp.ss('{}') = array['none'], 'search: owns nothing');
  perform pg_temp.ok(pg_temp.ss(array['blender']) = array['blend','none'], 'search: blender -> either-or recipe');
  perform pg_temp.ok(pg_temp.ss(array['food-processor']) = array['blend','none'], 'search: processor -> either-or recipe');
  perform pg_temp.ok(pg_temp.ss(array['blender','food-processor']) = array['blend','both','none'], 'search: both halves also make "both"');
  perform pg_temp.ok(pg_temp.ss(array['food-processor','pot']) = array['blend','blendpot','none'], 'search: group member + ungrouped pot');
  perform pg_temp.ok(pg_temp.ss(array['griddle','blender']) = array['blend','none','two'], 'search: one member of each group');
  perform pg_temp.ok(pg_temp.ss(array['skillet','griddle']) = array['none','solo'], 'search: second group still required');
  perform pg_temp.ok(pg_temp.ss(null, array['griddle']) = array['two'], 'search: uses griddle');
  perform pg_temp.ok(pg_temp.ss(null, array['food-processor']) = array['blend','blendpot','both','two'], 'search: uses food-processor');

  -- makeable_recipes (browse) -------------------------------------------------------------------
  perform pg_temp.ok(pg_temp.mk_browse(null) = array['none'], 'browse: NULL owned = owns nothing');
  perform pg_temp.ok(pg_temp.mk_browse('{}') = array['none'], 'browse: owns nothing');
  perform pg_temp.ok(pg_temp.mk_browse(array['blender']) = array['blend','none'], 'browse: blender -> either-or recipe');
  perform pg_temp.ok(pg_temp.mk_browse(array['food-processor','pot']) = array['blend','blendpot','none'], 'browse: member + pot');
  perform pg_temp.ok(pg_temp.mk_browse(array['griddle','blender']) = array['blend','none','two'], 'browse: one member of each group');
  perform pg_temp.ok(pg_temp.mk_browse(array['blender','food-processor']) = array['blend','both','none'], 'browse: both halves');
  perform pg_temp.ok(pg_temp.mk_browse(array['skillet','griddle']) = array['none','solo'], 'browse: second group still required');

  -- constraint -----------------------------------------------------------------------------------
  begin
    update recipe_cookware set alt_group = 0 where recipe_id = (select id from t_r where k = 'blend') and alt_group = 1;
    perform pg_temp.ok(false, 'alt_group = 0 must be rejected');
  exception when check_violation then
    perform pg_temp.ok(true, 'alt_group must be positive');
  end;

  -- seeded real data (only when supabase/seed-cookware.sql has been applied) -----------------------
  select count(*) into n_grouped from recipe_cookware where alt_group is not null;
  if n_grouped > 0 then
    -- every group has 2+ members (a one-row "group" is a data mistake)
    perform pg_temp.ok(not exists (
      select 1 from recipe_cookware where alt_group is not null
      group by recipe_id, alt_group having count(*) < 2), 'seed: every alt group has at least 2 members');
    -- gazpacho: a blender OR a food processor
    perform pg_temp.ok(
      (select array_agg(c.slug order by c.slug) from recipe_cookware rk join cookware c on c.id = rk.cookware_id
        join recipes r on r.id = rk.recipe_id where r.slug = 'gazpacho' and rk.alt_group = 1)
        = array['blender','food-processor'], 'seed: gazpacho = blender or food processor');
    perform pg_temp.ok('gazpacho' in (select slug from makeable_recipes(array['food-processor'])),
      'seed: someone with only a food processor can make gazpacho');
    perform pg_temp.ok('gazpacho' in (select slug from makeable_recipes(array['blender'])),
      'seed: someone with only a blender can make gazpacho');
    perform pg_temp.ok('gazpacho' not in (select slug from makeable_recipes('{}')), 'seed: nobody with no cookware makes gazpacho');
    -- fried rice: skillet or wok
    perform pg_temp.ok('fried-rice' in (select slug from makeable_recipes(array['wok'])), 'seed: a wok alone makes fried rice');
    -- cream-broccoli-soup: saucepan AND (blender or food processor)
    perform pg_temp.ok('cream-broccoli-soup' in (select slug from makeable_recipes(array['saucepan','food-processor'])),
      'seed: saucepan + food processor makes cream of broccoli soup');
    perform pg_temp.ok('cream-broccoli-soup' not in (select slug from makeable_recipes(array['food-processor'])),
      'seed: a food processor alone is not enough (the saucepan is not an alternative)');
    -- a recipe that needs a skillet for one step and says "skillet or roasting pan" later is NOT grouped
    perform pg_temp.ok(not exists (
      select 1 from recipe_cookware rk join recipes r on r.id = rk.recipe_id
      where r.slug = 'pot-roasted-beef' and rk.alt_group is not null), 'seed: pot-roasted-beef is not grouped');
  else
    raise notice 'seed-cookware.sql not applied: real-data assertions skipped';
  end if;

  raise notice 'cookware alt-group tests passed: % assertions', (select n from t_n);
end $$;

rollback;
