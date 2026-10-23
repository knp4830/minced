-- M5.2: draft autosave for user recipes.
--
-- autosave_my_recipe(recipe_id, data) is what the recipe form calls a moment after someone stops typing.
-- It differs from save_my_recipe in three ways, all on purpose:
--   1. It only ever touches a DRAFT (or creates one). It never submits, never sends a published or
--      in-review recipe back through review, and never needs the rights confirmation. Anything that is
--      not a draft is refused with the hint "not_draft", so a stale tab cannot demote a live recipe.
--   2. It is forgiving about half-typed ingredient lines. A row whose name is not recognised yet, whose
--      amount is not a number yet, or whose unit is unknown is left out of this save and counted, instead
--      of failing the whole save. The domain rule is unchanged: nothing unresolved is ever stored, and
--      submitting for review still runs the strict save_my_recipe validation.
--   3. It reports how many lines it left out, so the form can say so plainly.
-- Everything else (title length, servings, limits, the 50 recipe cap, the feature switch, ownership) is
-- enforced by save_my_recipe itself, which this function calls. Per-line food picks ride along as
-- ingredients[].fdc_id, which the save_my_recipe wrapper already applies by position.

begin;

create function autosave_my_recipe(p_recipe_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid       uuid := (select auth.uid());
  st        recipe_status;
  el        jsonb;
  kept      jsonb := '[]'::jsonb;
  skipped   integer := 0;
  raw_name  text;
  raw_unit  text;
  qty       numeric;
  res       jsonb;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not feature_enabled('user_recipes') then
    raise exception 'recipe submissions are not available' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 150000 then
    raise exception 'bad request' using errcode = '22023';
  end if;

  if p_recipe_id is not null then
    select status into st from recipes where id = p_recipe_id and author_id = uid;
    if not found then
      raise exception 'recipe not found' using errcode = 'P0002';
    end if;
    if st <> 'draft' then
      raise exception 'This recipe is no longer a draft, so it is not saved automatically.'
        using errcode = '22023', hint = 'not_draft';
    end if;
  end if;

  if jsonb_typeof(p_data -> 'ingredients') = 'array' then
    if jsonb_array_length(p_data -> 'ingredients') > 60 then
      raise exception 'A recipe can have at most 60 ingredients' using errcode = '22023', hint = 'ingredients';
    end if;
    for el in select * from jsonb_array_elements(p_data -> 'ingredients') loop
      begin
        if jsonb_typeof(el) <> 'object' then
          raise exception 'bad row' using errcode = '22023';
        end if;
        raw_name := user_recipe_text(el ->> 'name', 'ingredient', 0, 80);
        raw_unit := user_recipe_text(el ->> 'unit', 'unit', 0, 30);
        qty := user_recipe_num(el -> 'quantity', 'quantity', 0, 100000, false);
        if raw_name is null then
          -- A fully blank row is nothing. A row with an amount or unit but no name yet is a line in progress.
          if qty is not null or raw_unit is not null then
            skipped := skipped + 1;
          end if;
          continue;
        end if;
        if qty is not null and qty <= 0 then
          raise exception 'bad amount' using errcode = '22023';
        end if;
        if not exists (select 1 from resolve_ingredient(raw_name)) then
          raise exception 'unknown ingredient' using errcode = '22023';
        end if;
        if raw_unit is not null and not exists (select 1 from resolve_unit(raw_unit)) then
          raise exception 'unknown unit' using errcode = '22023';
        end if;
        kept := kept || jsonb_build_array(el);
      exception when sqlstate '22023' then
        skipped := skipped + 1;
      end;
    end loop;
  end if;

  -- Never a submission, whatever the payload says.
  res := save_my_recipe(p_recipe_id, (p_data - 'rights_confirmed') || jsonb_build_object('ingredients', kept), false);
  return res || jsonb_build_object('skipped', skipped);
end;
$$;

revoke all on function autosave_my_recipe(uuid, jsonb) from public, anon;
grant execute on function autosave_my_recipe(uuid, jsonb) to authenticated;

commit;
