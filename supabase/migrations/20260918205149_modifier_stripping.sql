-- M1.5.3 -- modifier stripping in ingredient resolution.
--
-- THE PROBLEM, MEASURED
--
-- Importing USDA MyPlate rejected ~75% of recipes on unresolved ingredients.
-- The unresolved queue was not full of exotic foods; it was full of ordinary
-- ones wearing adjectives:
--
--   red apples, tart apples, granny smith apple      -> apple
--   cod fillets, tilapia fish fillets                -> cod, tilapia
--   canned yellow corn, fresh corn kernels           -> corn
--   reduced sodium sliced carrots                    -> carrot
--   quick-cooking oats                               -> rolled oats
--
-- These are a SHAPE, not a list of synonyms. Every one could be an alias row,
-- and the next thousand recipes would invent a thousand more. "low-sodium" and
-- "reduced-sodium" and "no salt added" multiply against every ingredient they
-- can modify. Curating that set by hand is a treadmill.
--
-- WHY THIS IS SAFE, AND WHY THE ORDER IS THE WHOLE DESIGN
--
-- Stripping adjectives is dangerous in general: M1.5.1 deliberately SPLIT
-- "dried thyme" from "fresh thyme", and a naive stripper would collapse them
-- and undo that work.
--
-- It cannot happen here, because stripping runs LAST -- after exact and alias
-- matching have both failed. "dried thyme" matches its own row on pass 1 and
-- never reaches the stripper. Only a name that resolves to NOTHING gets its
-- modifiers removed. A deliberate distinction always wins, because a deliberate
-- distinction is always already in the table.

begin;

-- ---------------------------------------------------------------------------
-- The modifier vocabulary lives in a TABLE, not in the function body.
--
-- It is tuning data, not structure: adding "organic" should be a seed change
-- someone can read in a diff, not a schema migration. Same reasoning that put
-- ingredient aliases in a table.
-- ---------------------------------------------------------------------------
create table ingredient_modifiers (
  word     citext primary key,
  position text   not null default 'leading'
             check (position in ('leading', 'trailing'))
);

comment on table ingredient_modifiers is
  'Adjectives stripped from an ingredient name ONLY when it fails to resolve '
  'outright. Never contains a word that changes what to buy -- "ground" is not '
  'here, because ground beef is not beef.';

alter table ingredient_modifiers enable row level security;

create policy "reference data is public" on ingredient_modifiers
  for select using (true);

-- ---------------------------------------------------------------------------
-- strip_ingredient_modifiers(name) -- peel modifiers until nothing more comes
-- off, then return what is left.
--
-- Repeats because real lines stack them: "reduced sodium whole kernel corn" is
-- three deep. Stops at two surviving words minimum so "sweet potato" cannot be
-- stripped down to "potato" -- a different vegetable, and exactly the kind of
-- confident wrongness this whole milestone is built to avoid.
-- ---------------------------------------------------------------------------
create or replace function strip_ingredient_modifiers(raw text)
returns text
language plpgsql
stable
parallel safe
as $$
declare
  words    text[];
  changed  boolean := true;
  guard    int     := 0;
begin
  if raw is null then
    return null;
  end if;

  words := string_to_array(normalize_ingredient_name(raw), ' ');
  if words is null then
    return null;
  end if;

  while changed and guard < 8 loop
    changed := false;
    guard   := guard + 1;

    if array_length(words, 1) > 1
       and exists (select 1 from ingredient_modifiers m
                   where m.position = 'leading' and m.word = words[1]) then
      words   := words[2:array_length(words, 1)];
      changed := true;
    end if;

    if array_length(words, 1) > 1
       and exists (select 1 from ingredient_modifiers m
                   where m.position = 'trailing'
                     and m.word = words[array_length(words, 1)]) then
      words   := words[1:array_length(words, 1) - 1];
      changed := true;
    end if;
  end loop;

  return array_to_string(words, ' ');
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_ingredient, now with a fifth pass.
--
--   1. exact   canonical_name
--   2. exact   canonical_name, singularised
--   3. alias
--   4. STRIPPED name, retried against canonical names and aliases   <-- new
--   5. fuzzy   trigram
--
-- The stripped pass sits ABOVE fuzzy deliberately. "canned yellow corn" -> corn
-- is a rule someone can read and check; a trigram score of 0.52 is not. Given
-- both can answer, the explainable one should win.
--
-- Reported as match_kind 'fuzzy' with confidence 0.9: it is not the exact match
-- that 'exact' and 'alias' promise, so it stays visible in every coverage
-- report and review queue rather than quietly counting as certain.
-- ---------------------------------------------------------------------------
create or replace function resolve_ingredient(
  raw_name       text,
  min_similarity real default 0.45
)
returns table (
  ingredient_id  integer,
  canonical_name citext,
  match_kind     ingredient_match_kind,
  confidence     real
)
language plpgsql
stable
parallel safe
as $$
declare
  probe      text := normalize_ingredient_name(raw_name);
  probe_s    text;
  stripped   text;
  stripped_s text;
  words      text[];
  removed    boolean;
begin
  if probe is null then
    return;
  end if;

  probe_s := singularize_ingredient_name(probe);

  -- 1 + 2. Exact on the canonical name. Confidence 1.0: this is not a guess.
  return query
    select i.id, i.canonical_name, 'exact'::ingredient_match_kind, 1.0::real
    from ingredients i
    where normalize_ingredient_name(i.canonical_name::text) in (probe, probe_s)
    order by (normalize_ingredient_name(i.canonical_name::text) = probe) desc
    limit 1;
  if found then return; end if;

  -- 3. Exact on a curated alias. Also 1.0 -- a human asserted this equivalence.
  return query
    select i.id, i.canonical_name, 'alias'::ingredient_match_kind, 1.0::real
    from ingredient_aliases a
    join ingredients i on i.id = a.ingredient_id
    where normalize_ingredient_name(a.alias::text) in (probe, probe_s)
    order by (normalize_ingredient_name(a.alias::text) = probe) desc
    limit 1;
  if found then return; end if;

  -- 4. Strip modifiers ONE AT A TIME, testing after every removal.
  --
  --    Testing only the fully stripped form is wrong, and measurably so:
  --    "no salt added diced tomatoes" would strip all the way down to
  --    "tomatoes" and resolve to the fresh TOMATO, silently losing the fact
  --    that this is a can of diced tomatoes -- a different thing to buy and a
  --    different pantry match. Removing one word at a time finds
  --    "diced tomatoes", which is its own canonical row, and stops there.
  --
  --    The rule: stop at the FIRST thing that resolves, because the longest
  --    name that still matches is the most specific one.
  words := string_to_array(probe, ' ');
  loop
    removed := false;

    if array_length(words, 1) > 1
       and exists (select 1 from ingredient_modifiers m
                   where m.position = 'leading' and m.word = words[1]) then
      words   := words[2:array_length(words, 1)];
      removed := true;
    elsif array_length(words, 1) > 1
       and exists (select 1 from ingredient_modifiers m
                   where m.position = 'trailing'
                     and m.word = words[array_length(words, 1)]) then
      words   := words[1:array_length(words, 1) - 1];
      removed := true;
    end if;

    exit when not removed;

    stripped   := array_to_string(words, ' ');
    stripped_s := singularize_ingredient_name(stripped);

    return query
      select i.id, i.canonical_name, 'fuzzy'::ingredient_match_kind, 0.9::real
      from ingredients i
      where normalize_ingredient_name(i.canonical_name::text) in (stripped, stripped_s)
      limit 1;
    if found then return; end if;

    return query
      select i.id, i.canonical_name, 'fuzzy'::ingredient_match_kind, 0.9::real
      from ingredient_aliases a
      join ingredients i on i.id = a.ingredient_id
      where normalize_ingredient_name(a.alias::text) in (stripped, stripped_s)
      limit 1;
    if found then return; end if;
  end loop;

  -- 5. Trigram. Both tables compete; the best score anywhere wins.
  return query
    select c.id, c.canonical_name, 'fuzzy'::ingredient_match_kind, c.sim
    from (
      select i.id, i.canonical_name, similarity(i.canonical_name::text, probe) as sim
      from ingredients i
      union all
      select i.id, i.canonical_name, similarity(a.alias::text, probe) as sim
      from ingredient_aliases a
      join ingredients i on i.id = a.ingredient_id
    ) c
    where c.sim >= min_similarity
    order by c.sim desc, c.canonical_name
    limit 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- resolve_unit gets the same treatment, for the same reason.
--
-- USDA writes "2 medium celery stalks", and the parser hands back the unit
-- "medium stalks". Without this, the unit is unknown, and an unknown unit means
-- the QUANTITY is dropped too -- so a recipe silently loses "2" from an
-- ingredient it does know. Stripping the size word recovers it.
--
-- Still no fuzzy tier: tsp and tbsp stay three characters and three times apart.
-- ---------------------------------------------------------------------------
create or replace function resolve_unit(raw_unit text)
returns table (unit_id integer, unit_name citext, kind unit_kind)
language plpgsql
stable
parallel safe
as $$
declare
  probe   text := normalize_ingredient_name(raw_unit);
  probe_s text;
  words   text[];
begin
  if probe is null then
    return;
  end if;

  probe_s := singularize_ingredient_name(probe);

  return query
    select u.id, u.name, u.kind
    from units u
    where normalize_ingredient_name(u.name::text) in (probe, probe_s)
    limit 1;
  if found then return; end if;

  return query
    select u.id, u.name, u.kind
    from unit_aliases a
    join units u on u.id = a.unit_id
    where normalize_ingredient_name(a.alias::text) in (probe, probe_s)
    limit 1;
  if found then return; end if;

  -- Drop leading size/description words and try the last word on its own.
  words := string_to_array(probe, ' ');
  if array_length(words, 1) > 1 then
    probe   := words[array_length(words, 1)];
    probe_s := singularize_ingredient_name(probe);

    return query
      select u.id, u.name, u.kind
      from units u
      where normalize_ingredient_name(u.name::text) in (probe, probe_s)
      limit 1;
    if found then return; end if;

    return query
      select u.id, u.name, u.kind
      from unit_aliases a
      join units u on u.id = a.unit_id
      where normalize_ingredient_name(a.alias::text) in (probe, probe_s)
      limit 1;
  end if;
end;
$$;

commit;
