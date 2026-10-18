#!/usr/bin/env python3
"""
Builds the reviewed ingredient allergen / diet-class table from scripts/allergens/review/tag-sources*.txt.

  python scripts/allergens/build.py            # validate, write review/ingredient-allergens.csv, print summary
  python scripts/allergens/build.py --seed     # also write supabase/seed-allergen-tags.sql
  python scripts/allergens/build.py --untagged # list ingredients with no tag and a plain default class (scan for misses)

Input: scripts/allergens/work/ingredients.psv, exported from the database:
  id|canonical_name|filter_group|aisle|previous allergen slugs (;)|recipe uses
Every name in the source files must exist; an unknown name is an error (a typo would silently drop a tag).
"""
import csv, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ALLERGENS = ["gluten", "wheat", "dairy", "egg", "fish", "soy", "peanuts", "tree-nuts", "shellfish", "mollusks", "sesame"]
RANK = {"I": 3, "T": 2, "V": 1}
BASIS_NAME = {"I": "inherent", "T": "typical", "V": "varies"}
CLASSES = ["plant", "honey", "dairy_egg", "seafood", "meat"]
LINE = re.compile(r"^\[(?P<tags>[^\]]*)\]\s*(?:\{(?P<cls>\w+)\})?\s*(?P<reason>.*?)\s*::\s*(?P<names>.+)$")


def load_ingredients():
    rows = []
    with open(os.path.join(HERE, "work", "ingredients.psv"), encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("|")
            rows.append({"id": int(p[0]), "name": p[1], "group": p[2], "aisle": p[3], "old": p[4], "uses": int(p[5])})
    return rows


def parse_sources(valid):
    tags, reasons, cls, cls_reason = {}, {}, {}, {}
    errors = []
    for fn in sorted(f for f in os.listdir(os.path.join(HERE, "review")) if f.startswith("tag-sources") and f.endswith(".txt")):
        path = os.path.join(HERE, "review", fn)
        for no, raw in enumerate(open(path, encoding="utf-8"), 1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            m = LINE.match(line)
            if not m:
                errors.append(f"{fn}:{no}: cannot parse")
                continue
            spec = [t.strip() for t in m["tags"].split(",") if t.strip()]
            parsed = []
            for t in spec:
                a, _, b = t.partition(":")
                if a not in ALLERGENS or b not in RANK:
                    errors.append(f"{fn}:{no}: bad tag {t!r}")
                else:
                    parsed.append((a, b))
            c = m["cls"]
            if c and c not in CLASSES:
                errors.append(f"{fn}:{no}: bad class {c!r}")
            for name in (n.strip() for n in m["names"].split(";") if n.strip()):
                if name not in valid:
                    errors.append(f"{fn}:{no}: unknown ingredient {name!r}")
                    continue
                for a, b in parsed:
                    cur = tags.setdefault(name, {})
                    if a not in cur or RANK[b] > RANK[cur[a]]:
                        cur[a] = b
                    reasons.setdefault(name, [])
                    if m["reason"] not in reasons[name]:
                        reasons[name].append(m["reason"])
                if c:
                    cls[name] = c
                    cls_reason[name] = m["reason"]
    return tags, reasons, cls, cls_reason, errors


def main():
    ings = load_ingredients()
    valid = {r["name"] for r in ings}
    tags, reasons, cls, cls_reason, errors = parse_sources(valid)
    if errors:
        print("\n".join(errors))
        sys.exit(1)

    out = []
    for r in ings:
        name = r["name"]
        t = dict(tags.get(name, {}))
        if "wheat" in t and "gluten" not in t:
            t["gluten"] = t["wheat"]  # P7: wheat implies gluten
        c = cls.get(name)
        why_c = cls_reason.get(name, "")
        if not c:
            animal_fish = [a for a in ("fish", "shellfish", "mollusks") if a in t]
            if any(a in t for a in ("dairy", "egg")) and not animal_fish:
                c, why_c = "dairy_egg", "carries a dairy or egg tag"
            elif animal_fish:
                c, why_c = "seafood", "carries a fish or shellfish tag"
            else:
                g = r["group"]
                c = {"meat": "meat", "seafood": "seafood", "eggs": "dairy_egg"}.get(g, "plant")
                why_c = f"filter group {g}" if g in ("meat", "seafood", "eggs") else "no animal ingredient"
            # both: dairy/egg plus fish -> the stricter class wins (seafood is stricter than dairy_egg)
        order = {a: i for i, a in enumerate(ALLERGENS)}
        items = sorted(t.items(), key=lambda kv: order[kv[0]])
        out.append({
            "ingredient": name,
            "allergens": ";".join(f"{a}:{b}" for a, b in items),
            "diet_class": c,
            "reason": " | ".join(reasons.get(name, [])) or "no listed allergen",
            "diet_reason": why_c,
            "previous_allergens": r["old"],
            "recipe_uses": r["uses"],
            "filter_group": r["group"],
        })

    path = os.path.join(HERE, "review", "ingredient-allergens.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    counts = {a: 0 for a in ALLERGENS}
    for o in out:
        for pair in filter(None, o["allergens"].split(";")):
            counts[pair.split(":")[0]] += 1
    cc = {c: sum(1 for o in out if o["diet_class"] == c) for c in CLASSES}
    print(f"wrote {path}: {len(out)} ingredients")
    print("allergen tags per allergen:", counts)
    print("diet classes:", cc)

    # Anything the OLD tags had that the new tags do not (a loss to justify).
    legacy = {"nuts": ["peanuts", "tree-nuts"], "shellfish": ["shellfish", "mollusks"]}
    lost = []
    for o in out:
        now = {p.split(":")[0] for p in filter(None, o["allergens"].split(";"))}
        for old in filter(None, o["previous_allergens"].split(";")):
            if not (set(legacy.get(old, [old])) & now):
                lost.append((o["ingredient"], old))
    print(f"previous tags with no replacement: {len(lost)}")
    for n, a in lost:
        print("   LOST", a, "<-", n)

    if "--untagged" in sys.argv:
        print("\nUNTAGGED (no allergen), non-plant class first:")
        for o in out:
            if not o["allergens"] and o["diet_class"] != "plant":
                print(f"   [{o['diet_class']}] {o['ingredient']}")
        print("\nUNTAGGED plant names:")
        print(" | ".join(o["ingredient"] for o in out if not o["allergens"] and o["diet_class"] == "plant"))

    if "--seed" in sys.argv:
        write_seed(out)


def sql(s):
    return "'" + s.replace("'", "''") + "'"


def exceptions_sql():
    path = os.path.join(HERE, "review", "recipe-diet-exceptions.csv")
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    out = ["-- Reviewed diet exceptions (scripts/allergens/review/recipe-diet-exceptions.csv). The table is replaced as a whole.", "delete from recipe_diet_exceptions;"]
    if rows:
        vals = ",\n".join(f"  ({sql(r['slug'])}, {sql(r['diet'])}, {sql(r['action'])}, {sql(r['reason'])})" for r in rows)
        out.append(
            "insert into recipe_diet_exceptions (recipe_id, diet_id, action, reason)\n"
            "select r.id, d.id, v.action, v.reason\n"
            "from (values\n" + vals + "\n) as v (slug, diet, action, reason)\n"
            "join recipes r on r.slug = v.slug\n"
            "join diets d on d.slug = v.diet;"
        )
        out.append(
            "do $$ begin if (select count(*) from recipe_diet_exceptions) <> " + str(len(rows)) + " then "
            "raise exception 'a diet exception names a recipe or diet that does not exist'; end if; end $$;"
        )
    return "\n".join(out) + "\n"


def write_seed(out):
    lines = []
    lines.append("-- Minced -- ingredient allergen tags and diet classes (wave 10c, generated; do not edit by hand)")
    lines.append("--")
    lines.append("-- Source of truth: scripts/allergens/review/tag-sources*.txt  ->  scripts/allergens/build.py --seed")
    lines.append("-- Reviewed table with a reason per row: scripts/allergens/review/ingredient-allergens.csv")
    lines.append("--")
    lines.append("-- REPLACES the whole ingredient_allergens table (the old rows were partial and used one 'nuts' bucket) and sets")
    lines.append("-- ingredients.diet_class for every ingredient, then rebuilds recipe_allergens and the derived recipe_diets.")
    lines.append("-- Idempotent. Run after migration 202610181200xx, as the postgres role. Triggers are paused while the table is")
    lines.append("-- rewritten and ONE bulk refresh runs at the end (per-row triggers would refresh every recipe thousands of times).")
    lines.append("")
    lines.append("begin;")
    lines.append("")
    lines.append("alter table ingredient_allergens disable trigger user;")
    lines.append("alter table ingredients disable trigger user;")
    lines.append("")
    lines.append("create temp table _tag (ingredient citext not null, allergen text not null, basis text not null, reason text not null) on commit drop;")
    lines.append("create temp table _cls (ingredient citext primary key, diet_class text not null, reason text not null) on commit drop;")
    lines.append("")
    tag_rows, cls_rows = [], []
    for o in out:
        for pair in filter(None, o["allergens"].split(";")):
            a, b = pair.split(":")
            tag_rows.append(f"  ({sql(o['ingredient'])}, {sql(a)}, {sql(BASIS_NAME[b])}, {sql(o['reason'])})")
        cls_rows.append(f"  ({sql(o['ingredient'])}, {sql(o['diet_class'])}, {sql(o['diet_reason'])})")
    lines.append("insert into _tag (ingredient, allergen, basis, reason) values")
    lines.append(",\n".join(tag_rows) + ";")
    lines.append("")
    lines.append("insert into _cls (ingredient, diet_class, reason) values")
    lines.append(",\n".join(cls_rows) + ";")
    lines.append("")
    lines.append(exceptions_sql())
    lines.append(f"""-- Fail loudly if a name or allergen slug does not resolve (a silently dropped tag is a false "safe").
do $$
declare bad text;
begin
  select string_agg(distinct t.ingredient::text, ', ') into bad from _tag t where not exists (select 1 from ingredients i where i.canonical_name = t.ingredient);
  if bad is not null then raise exception 'unknown ingredients in tag seed: %', bad; end if;
  select string_agg(distinct t.allergen, ', ') into bad from _tag t where not exists (select 1 from allergens a where a.slug = t.allergen);
  if bad is not null then raise exception 'unknown allergen slugs in tag seed (run migration 2026101812xxxx first): %', bad; end if;
  select string_agg(distinct c.ingredient::text, ', ') into bad from _cls c where not exists (select 1 from ingredients i where i.canonical_name = c.ingredient);
  if bad is not null then raise exception 'unknown ingredients in class seed: %', bad; end if;
  if (select count(*) from _cls) <> (select count(*) from ingredients) then
    raise exception 'class seed has % rows but there are % ingredients; regenerate it (build.py --seed)',
      (select count(*) from _cls), (select count(*) from ingredients);
  end if;
end $$;

delete from ingredient_allergens;
insert into ingredient_allergens (ingredient_id, allergen_id, basis, reason)
select i.id, a.id, t.basis, t.reason
from   _tag t
join   ingredients i on i.canonical_name = t.ingredient
join   allergens   a on a.slug = t.allergen
on conflict (ingredient_id, allergen_id) do update set basis = excluded.basis, reason = excluded.reason;

update ingredients i set diet_class = c.diet_class
from   _cls c
where  c.ingredient = i.canonical_name and i.diet_class is distinct from c.diet_class;

alter table ingredient_allergens enable trigger user;
alter table ingredients enable trigger user;

-- One bulk rebuild of the derived data (recipe_allergens with optional_only, and recipe_diets for catalog recipes).
select refresh_all_recipe_allergens();
select refresh_all_recipe_diets();

commit;
""")
    path = os.path.join(ROOT, "supabase", "seed-allergen-tags.sql")
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print("wrote", path)


if __name__ == "__main__":
    main()
