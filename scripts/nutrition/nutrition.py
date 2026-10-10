#!/usr/bin/env python3
"""USDA FoodData Central nutrition pipeline (M1.5.4).

For each selected recipe:
  1. map every ingredient to a USDA food          (ingredient-map.json, else search)
  2. convert quantity+unit to grams               (see Grams, below)
  3. sum grams/100 * per-100g nutrients, / servings
  4. flag anything it could not do honestly       (never silently guess)
and write an idempotent SQL file that fills recipes.calories/protein_g/....

    python scripts/nutrition/nutrition.py [--source LIKE] [--slugs a,b] [--ids uuid,..]
        [--compare-mockup] [--exclude-optional] [--offline] [--out DIR] [--emit-mapping PATH]
        [--accept-review]

Status per recipe: OK (written), REVIEW (an auto-matched ingredient or a missing
macro: held back unless --accept-review), INCOMPLETE (unmatched / unconvertible
ingredient: never written). Any held-back recipe makes the run exit 2.
Lines whose prep note says cooked / dried / roasted use the "<name> [form]" entry
of ingredient-map.json when there is one. Frying-bath oil is counted at its
absorbed share (see fry_retained).

Reads the database through psql (NUTRITION_PSQL, else psql "$DATABASE_URL", else
dockerised psql). It only ever SELECTs. Recipes sourced from USDA MyPlate already
carry USDA's own nutrition and are refused, not recomputed.
"""
import argparse
import json
import os
import re
import shlex
import statistics
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fdc import Fdc, KEYS  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MAP_PATH = os.path.join(HERE, "ingredient-map.json")

# recipes column per pipeline key, display label, decimals stored
COLS = [
    ("kcal", "calories", "Calories", 0),
    ("protein_g", "protein_g", "Protein", 1),
    ("carbs_g", "carbs_g", "Carbs", 1),
    ("fat_g", "fat_g", "Fat", 1),
    ("sodium_mg", "sodium_mg", "Sodium", 0),
    ("fiber_g", "fiber_g", "Fiber", 1),
]
CORE_KEYS = ("kcal", "protein_g", "carbs_g", "fat_g")
MYPLATE_COUNT = 872  # only used to space the validation sample


# --------------------------------------------------------------------- database
def psql_cmd():
    if os.environ.get("NUTRITION_PSQL"):
        return shlex.split(os.environ["NUTRITION_PSQL"], posix=True)
    url = os.environ.get("DATABASE_URL")
    if not url:
        path = os.path.join(REPO, ".env.local")
        if os.path.exists(path):
            for line in open(path, encoding="utf-8"):
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"')
    if not url:
        sys.exit("No database: set NUTRITION_PSQL (e.g. 'docker exec -i <ctr> psql -U postgres') or DATABASE_URL")
    from shutil import which

    if which("psql"):
        return ["psql", url]
    return ["docker", "run", "--rm", "-i", "postgres:16-alpine", "psql", url]


def fetch(args):
    where = ["r.source_name not ilike '%myplate%'"]
    if args.validate_usda:
        # Read-only accuracy check: MyPlate recipes DO carry USDA's own numbers,
        # so they are ground truth. Evenly spaced deterministic sample.
        where = ["r.source_name ilike '%myplate%'", "r.calories is not null",
                 "mod(r.rn, %d) = 0" % max(1, MYPLATE_COUNT // args.validate_usda)]
    elif args.slugs:
        where.append("r.slug in (%s)" % ",".join("'%s'" % s.replace("'", "''") for s in args.slugs.split(",")))
    elif args.ids:
        where.append("r.id in (%s)" % ",".join("'%s'::uuid" % i for i in args.ids.split(",")))
    else:
        where.append("r.source_name ilike '%s'" % args.source.replace("'", "''"))
    base = "(select *, row_number() over (order by slug) rn from recipes)"
    sql = f"""
select json_build_object(
  'units', (select json_object_agg(name, to_base_factor) from units),
  'unit_kinds', (select json_object_agg(name, kind) from units),
  'refused_usda', (select count(*) from recipes where source_name ilike '%myplate%'),
  'recipes', coalesce((select json_agg(x order by x.slug) from (
    select r.id, r.slug, r.title, r.servings, r.source_name,
      json_build_object('kcal', r.calories, 'protein_g', r.protein_g, 'carbs_g', r.carbs_g, 'fat_g', r.fat_g, 'sodium_mg', r.sodium_mg, 'fiber_g', r.fiber_g) as stored,
      (select json_agg(json_build_object(
          'ingredient_id', i.id, 'name', i.canonical_name, 'quantity', ri.quantity,
          'unit', u.name, 'kind', u.kind, 'factor', u.to_base_factor,
          'optional', ri.is_optional, 'prep', ri.prep_note) order by ri.sort_order)
       from recipe_ingredients ri join ingredients i on i.id = ri.ingredient_id
       left join units u on u.id = ri.unit_id where ri.recipe_id = r.id) as ingredients
    from {base} r where {' and '.join(where)}) x), '[]'::json)
);"""
    out = subprocess.run(psql_cmd() + ["-At", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, encoding="utf-8")
    if out.returncode:
        sys.exit("psql failed: " + out.stderr.strip()[:500])
    return json.loads(out.stdout)


# ---------------------------------------------------------------------- grams
def label_of(p):
    return (p["modifier"] or p["description"] or p["unit"] or "").lower()


def volume_density(food, factors):
    """Median g/ml over the food's USDA volume portions (cup, tbsp, tsp, fl oz)."""
    ds = []
    for p in food["portions"]:
        m = re.match(r"(fl oz|tsp|tbsp|cup)\b", label_of(p))
        if m:
            ml = p["amount"] * factors[m.group(1)]
            ds.append(p["grams"] / ml)
    return statistics.median(ds) if ds else None


# A USDA portion label that names a PART of the item, never the whole thing:
# 'strip medium' (bacon), 'slice, medium', 'wedge', 'leaf, large', 'floret'.
# 'each' (a recipe line with no unit, "1 onion") must never pick one of these.
PART_WORDS = re.compile(
    r"\b(strips?|slices?|pieces?|wedges?|leaf|leaves|sprigs?|rings?|halves|half|quarters?|florets?|"
    r"stalks?|cloves?|sticks?|spears?|segments?|sections?|sheets?|links?|patt(?:y|ies)|"
    r"cup|cups|can|cans|pods?|fillets?|chunks?|cubes?|rib|ribs|bulb|sliced|chopped|diced|shredded|grated|mashed|crumbled)\b"
)
EACH_WORDS = ("medium", "large", "whole", "fruit", "each", "head")


def portion_grams(food, unit):
    """Grams for ONE `unit` (a count word, or 'each') from USDA portions."""
    cands = []
    for p in food["portions"]:
        lab = label_of(p)
        if re.match(r"(fl oz|tsp|tbsp|cup|oz|g|lb)\b", lab):
            continue
        per_one = p["grams"] / (p["amount"] or 1)
        if unit != "each":
            if re.search(r"\b%ss?\b" % re.escape(unit), lab):
                cands.append((0, per_one))
        else:
            if PART_WORDS.search(lab):
                continue
            for rank, word in enumerate(EACH_WORDS):
                if word in lab:
                    cands.append((rank, per_one))
                    break
    return min(cands)[1] if cands else None


class Profile:
    def __init__(self, name, entry, food, auto, match_desc):
        self.name, self.entry, self.food, self.auto, self.match_desc = name, entry, food, auto, match_desc


def _stem(w):
    w = w.lower()
    for suf in ("ies", "es", "s"):
        if w.endswith(suf) and len(w) > len(suf) + 2:
            return w[: -len(suf)] + ("y" if suf == "ies" else "")
    return w


def score_candidate(name, desc):
    """Heuristic rank for an auto-match. USDA names run 'Category, food, state',
    so a hit whose FIRST two segments contain the query's head noun beats one that
    only mentions it later ('Rolls, dinner, oat bran' for 'rolled oats')."""
    q = [_stem(t) for t in re.findall(r"[a-z]+", name.lower())]
    segs = [[_stem(t) for t in re.findall(r"[a-z]+", sg)] for sg in desc.lower().split(",")]
    head = q[-1]
    sc = 0
    if any(head in sg for sg in segs[:2]):
        sc += 4
    sc += 2 * sum(any(t in sg for sg in segs) for t in q[:-1])
    sc -= max(0, len(segs) - 3)
    if "raw" in desc.lower():
        sc += 1
    if segs and segs[0] and segs[0][0] not in q and head not in segs[0]:
        sc -= 1  # leading category word unrelated to the query (e.g. 'Oil, avocado' for 'avocado')
    return sc


# A recipe line's prep note can say the weight is of a different FORM than the
# base ingredient: "3 cups white rice, cooked" is ~3x lighter in kcal than 3 cups
# of raw rice. If ingredient-map.json has a "<name> [<form>]" entry, it is used.
FORM_WORDS = ("cooked", "dried", "roasted")


def form_key(name, prep, cmap):
    for word in FORM_WORDS:
        if re.search(r"\b%s\b" % word, (prep or "").lower()) and f"{name} [{word}]" in cmap:
            return f"{name} [{word}]"
    return name


def build_profile(name, cmap, fdc):
    entry = cmap.get(name)
    if entry:
        return Profile(name, entry, fdc.food(entry["fdc_id"]), False, None)
    hits = fdc.search(name, 10, "SR Legacy") or fdc.search(name)
    if not hits:
        return Profile(name, {}, None, True, None)
    ranked = sorted(hits, key=lambda h: -score_candidate(name, h["description"]))  # stable: ties keep USDA order
    # Prefer the best-scored hit that is USABLE: has energy and a household
    # portion (some records are partial, and a portion-less food cannot turn
    # cups into grams).
    best = None
    for h in ranked[:3]:
        food = fdc.food(h["fdc_id"])
        best = best or (h, food)
        if "kcal" in food["per100g"] and food["portions"]:
            best = (h, food)
            break
    h, food = best
    return Profile(name, {"fdc_id": h["fdc_id"]}, food, True, h["description"])


def to_grams(line, prof, factors):
    """-> (grams or None, how). `how` names the rule used, for the audit trail."""
    q, unit, kind = line["quantity"], line["unit"], line["kind"]
    if kind == "mass":
        return q * line["factor"], "mass"
    if kind == "volume":
        d = prof.entry.get("density_g_per_ml") or volume_density(prof.food, factors)
        if d:
            src = "curated density" if prof.entry.get("density_g_per_ml") else "USDA portions"
            return q * line["factor"] * d, f"volume x density ({src})"
        return None, "no density"
    key = unit or "each"
    g = (prof.entry.get("unit_g") or {}).get(key)
    if g:
        return q * g, f"curated {key}"
    g = portion_grams(prof.food, key)
    if g:
        return q * g, f"USDA portion {key}"
    return None, f"no weight for '{key}'"


FRY_BATH_G = 200  # an oil line this heavy (about a cup) with no other signal is a frying bath


def fry_retained(line, prof, grams):
    """Fraction of a frying-bath oil line that ends up in the food, else None.

    A recipe that says "2 cups vegetable oil, for frying potatoes" does not feed
    anyone 2 cups of oil: the food keeps roughly 8-25% of a deep-fry bath. Only
    oils opted in with `fry_retained` in ingredient-map.json are touched, and only
    when the line says so ('frying' in the note) or is >= ~1 cup. Everything else
    (a shallow 2 tbsp sauté) is counted in full."""
    frac = prof.entry.get("fry_retained")
    if not frac or grams is None:
        return None
    if "fry" in (line.get("prep") or "").lower() or grams >= FRY_BATH_G:
        return frac
    return None


# ------------------------------------------------------------------- compute
def compute(recipe, cmap, fdc, factors, exclude_optional):
    rows, flags = [], []
    total = {k: 0.0 for k in KEYS}
    blocking = False
    for line in recipe["ingredients"]:
        if line["optional"] and exclude_optional:
            flags.append(("info", f"{line['name']}: optional, excluded"))
            continue
        prof = build_profile(form_key(line["name"], line.get("prep"), cmap), cmap, fdc)
        if prof.food is None:
            flags.append(("error", f"{line['name']}: no USDA match"))
            blocking = True
            continue
        if prof.auto:
            flags.append(("warn", f"{line['name']}: AUTO-MATCHED to '{prof.match_desc}' (fdc {prof.entry['fdc_id']}) - verify, then add to ingredient-map.json"))
        if line["quantity"] is None:
            flags.append(("info", f"{line['name']}: no quantity ('to taste'), contributes 0"))
            continue
        grams, how = to_grams(line, prof, factors)
        if grams is None:
            flags.append(("error", f"{line['name']}: cannot convert {line['quantity']:g} {line['unit'] or 'each'} to grams ({how})"))
            blocking = True
            continue
        retained = fry_retained(line, prof, grams)
        if retained is not None:
            flags.append(("note", f"{line['name']}: {grams:.0f} g is a frying bath; counting {retained:.0%} as absorbed ({grams * retained:.0f} g)"))
            grams *= retained
            how += f", frying bath x{retained:g}"
        if "kcal" not in prof.food["per100g"]:
            # Some Foundation records are partial (sodium only). Counting that as
            # 0 kcal would be a silent wrong answer, so it blocks the recipe.
            flags.append(("error", f"{line['name']}: USDA food {prof.food['fdc_id']} has no energy data; pick another food"))
            blocking = True
            continue
        missing = [k for k in KEYS if k not in prof.food["per100g"]]
        core = [k for k in missing if k in CORE_KEYS]
        if core:
            # An unreported macro counted as 0 understates the recipe: gate it.
            flags.append(("warn", f"{line['name']}: USDA reports no {', '.join(core)}; counted as 0"))
        if set(missing) - set(CORE_KEYS):
            # Sodium/fibre are often absent for foods that have none (oils, sugar).
            # Shown, but not a reason to hold the recipe back.
            flags.append(("note", f"{line['name']}: USDA reports no {', '.join(sorted(set(missing) - set(CORE_KEYS)))}; counted as 0"))
        for k in KEYS:
            total[k] += grams / 100.0 * prof.food["per100g"].get(k, 0.0)
        rows.append((line["name"], line["quantity"], line["unit"] or "", grams, how, prof.food["description"], prof.food["fdc_id"]))
    per = {k: total[k] / recipe["servings"] for k in KEYS}
    return per, rows, flags, blocking


# ------------------------------------------------------------------- mockup
def slugify(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")


def read_mockup():
    html = open(os.path.join(REPO, "design", "Minced.dc.html"), encoding="utf-8").read()
    start = html.index("RECIPES = [")
    block = html[start : html.index("steps:", start + 6000) if False else len(html)]
    out = {}
    for m in re.finditer(r"title:'([^']+)'.*?nutrition:\[(.*?)\]\s*,\s*\n\s*ingredients:", block, re.S):
        vals = re.findall(r"\['([^']+)','([^']+)','[^']*'\]", m.group(2))
        out[slugify(m.group(1))] = {k: float(v) for k, v in vals}
    return out


def compare(results, mock):
    label_of_key = {k: lab for k, _, lab, _ in COLS}
    print("\n## DoD: computed vs mockup hand-written values (per serving)\n")
    print("| Recipe | Nutrient | Mockup | Computed | Diff | Within 10% |")
    print("|---|---|---:|---:|---:|:--:|")
    ok = tot = 0
    per_recipe = {}
    for slug, per in results.items():
        mk = mock.get(slug)
        if not mk:
            continue
        for k, _, lab, dec in COLS:
            want, got = mk[lab], round(per[k], dec)
            diff = (got - want) / want * 100 if want else 0.0
            good = abs(diff) <= 10
            ok += good
            tot += 1
            per_recipe.setdefault(slug, []).append(good)
            print(f"| {slug} | {lab} | {want:g} | {got:g} | {diff:+.0f}% | {'yes' if good else 'NO'} |")
    print(f"\n{ok}/{tot} nutrient values within 10%; recipes with all six within 10%: "
          f"{sum(all(v) for v in per_recipe.values())}/{len(per_recipe)}")
    cals = [(s, (round(r['kcal']) - mock[s]['Calories']) / mock[s]['Calories'] * 100) for s, r in results.items() if s in mock]
    print("Calories diff: " + ", ".join(f"{s} {d:+.0f}%" for s, d in cals))


def inject_extras(data, extras, factors):
    kinds = data.get("unit_kinds") or {}
    for spec in extras:
        slug, name, qty, unit = spec.split(":")
        # Count units (clove, can, ...) have no to_base_factor; only mass/volume do.
        # An empty unit means "each".
        kind = kinds.get(unit) if unit else "count"
        if unit and kind is None:
            sys.exit(f"--extra {spec}: unknown unit '{unit}'")
        for r in data["recipes"]:
            if r["slug"] == slug:
                r["ingredients"].append({"ingredient_id": None, "name": name, "quantity": float(qty), "unit": unit or None,
                                         "kind": kind, "factor": factors.get(unit), "optional": False, "prep": "what-if"})


def report_validation(errs, n, n_blocked):
    print()
    print("## Validation against USDA MyPlate stored nutrition (ground truth, read-only)")
    print()
    print(f"{n} recipes sampled; {n_blocked} not computable (unmatched/unconvertible ingredient); {len(errs)} compared.")
    print()
    print("| Nutrient | median abs error | share within 10% | share within 25% |")
    print("|---|---:|---:|---:|")
    for k, _, lab, _ in COLS:
        e = sorted(abs(x[1][k]) for x in errs if k in x[1])
        if not e:
            continue
        print(f"| {lab} | {statistics.median(e):.0f}% | {sum(v <= 10 for v in e) / len(e):.0%} | {sum(v <= 25 for v in e) / len(e):.0%} |")
    clean = [x for x in errs if x[2] == "OK"]
    if clean:
        e = sorted(abs(x[1]["kcal"]) for x in clean if "kcal" in x[1])
        print()
        print(f"Calories only, recipes with no warnings ({len(e)}): median {statistics.median(e):.0f}%, within 10%: {sum(v <= 10 for v in e) / len(e):.0%}")
    worst = sorted(errs, key=lambda x: -abs(x[1].get("kcal", 0)))[:5]
    print()
    print("Worst calorie misses: " + "; ".join(f"{s} {e.get('kcal', 0):+.0f}%" for s, e, _ in worst))


# ----------------------------------------------------------------------- SQL
def q(s):
    return "'" + s.replace("'", "''") + "'"


def write_sql(results, out_dir, cmap_path, review_written=()):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "recipe-nutrition.sql")
    lines = [
        "-- Generated by scripts/nutrition/nutrition.py (M1.5.4). Idempotent: safe to re-run.",
        "-- Per-serving nutrition computed from USDA FoodData Central. The WHERE clause",
        "-- refuses USDA MyPlate rows, which already carry USDA's own numbers.",
    ]
    if review_written:
        lines.append("-- WARNING: written with --accept-review; these used an UNVERIFIED auto-matched ingredient:")
        lines.append("--   " + ", ".join(sorted(review_written)))
    lines.append("begin;")
    for slug, per in sorted(results.items()):
        sets = ", ".join(f"{col} = {round(per[k], dec):g}" for k, col, _, dec in COLS)
        lines.append(f"update recipes set {sets} where slug = {q(slug)} and source_name not ilike '%myplate%';")
    lines.append("commit;")
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    return path


def write_mapping_sql(cmap, path):
    lines = [
        "-- Generated by scripts/nutrition/nutrition.py --emit-mapping (M1.5.4). Idempotent.",
        "-- Source of truth: scripts/nutrition/ingredient-map.json. Writes the USDA FoodData",
        "-- Central id (and a curated density where one was needed) onto canonical ingredients.",
        "begin;",
    ]
    # "<name> [cooked]" style entries are pipeline-only forms, not ingredient rows.
    base = sorted(k for k in cmap if not k.startswith("_") and " [" not in k)
    for name in base:
        e = cmap[name]
        sets = f"fdc_id = {e['fdc_id']}"
        if e.get("density_g_per_ml"):
            sets += f", density_g_per_ml = {e['density_g_per_ml']}"
        lines.append(f"update ingredients set {sets} where canonical_name = {q(name)};")
    names = base
    # An UPDATE that matches no row succeeds silently ("UPDATE 0"), so assert it.
    lines.append("do $$ begin")
    lines.append(
        "  if (select count(*) from ingredients where fdc_id is not null and canonical_name in ("
        + ", ".join(q(n) for n in names)
        + f")) <> {len(names)} then"
    )
    lines.append("    raise exception 'seed-nutrition-fdc: some mapped ingredients are missing from ingredients';")
    lines.append("  end if;")
    lines.append("end $$;")
    lines.append("commit;")
    open(path, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")


# ---------------------------------------------------------------------- main
def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default="Minced%", help="source_name LIKE pattern (mockup + AI-drafted originals)")
    ap.add_argument("--slugs")
    ap.add_argument("--ids")
    ap.add_argument("--exclude-optional", action="store_true")
    ap.add_argument("--accept-review", action="store_true",
                    help="also write REVIEW-status recipes (auto-matched ingredients); they are marked in the SQL")
    ap.add_argument("--compare-mockup", action="store_true")
    ap.add_argument("--offline", action="store_true", help="cache only; never call USDA")
    ap.add_argument("--out", default=os.path.join(HERE, "artifacts"))
    ap.add_argument("--emit-mapping", metavar="PATH", help="write ingredient fdc_id/density SQL and exit")
    ap.add_argument("--validate-usda", type=int, metavar="N",
                    help="read-only accuracy check on ~N MyPlate recipes against their stored USDA nutrition; writes nothing")
    ap.add_argument("--extra", action="append", default=[], metavar="SLUG:NAME:QTY:UNIT",
                    help="what-if: add an ingredient line to a recipe in memory (never written to the DB)")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    cmap = json.load(open(MAP_PATH, encoding="utf-8"))
    if args.emit_mapping:
        write_mapping_sql(cmap, args.emit_mapping)
        print(f"wrote {args.emit_mapping}")
        return

    data = fetch(args)
    factors = {k: float(v) for k, v in data["units"].items() if v is not None}
    fdc = Fdc(offline=args.offline)
    inject_extras(data, args.extra, factors)
    results, blocked, review, errs = {}, {}, {}, []
    review_written = []
    print(f"# Nutrition run: {len(data['recipes'])} recipe(s)\n")
    for r in data["recipes"]:
        per, rows, flags, blocking = compute(r, cmap, fdc, factors, args.exclude_optional)
        status = "INCOMPLETE" if blocking else ("REVIEW" if any(f[0] == "warn" for f in flags) else "OK")
        print(f"## {r['slug']}  ({r['servings']} servings)  [{status}]")
        print("per serving: " + ", ".join(f"{lab} {round(per[k], dec):g}" for k, _, lab, dec in COLS))
        if args.verbose:
            for name, qty, unit, g, how, desc, fid in rows:
                print(f"  - {qty:g} {unit or 'each'} {name} = {g:.0f} g  [{how}]  <- {desc} ({fid})")
        for sev, msg in flags:
            if sev != "info" or args.verbose:
                print(f"  {sev.upper()}: {msg}")
        if blocking:
            blocked[r["slug"]] = flags
        elif status == "REVIEW" and not (args.accept_review or args.validate_usda):
            # Held back, not written: an auto-matched or partly-counted recipe is a guess.
            # Curate the ingredient in ingredient-map.json (or pass --accept-review to
            # write it anyway, which stamps the SQL so the guess is visible in the diff).
            review[r["slug"]] = flags
        else:
            if status == "REVIEW":
                review_written.append(r["slug"])
            results[r["slug"]] = per
            if args.validate_usda:
                errs.append((r["slug"], {k: (per[k] - r["stored"][k]) / r["stored"][k] * 100 for k in KEYS if r["stored"].get(k)}, status))
        print()
    fdc.save()
    if data["refused_usda"]:
        print(f"(refused {data['refused_usda']} USDA MyPlate recipe(s): they already carry USDA nutrition)")
    if args.validate_usda:
        report_validation(errs, len(data["recipes"]), len(blocked))
        print(f"USDA requests this run: {fdc.requests}")
        return
    if args.compare_mockup:
        compare(results, read_mockup())
    if results:
        print(f"\nwrote {write_sql(results, args.out, MAP_PATH, review_written)}  ({len(results)} recipes)")
    if review:
        print(f"NOT written (REVIEW: unverified match or partly-counted nutrients; curate them): {', '.join(review)}")
    if blocked:
        print(f"NOT written (incomplete, fix by hand): {', '.join(blocked)}")
    print(f"USDA requests this run: {fdc.requests} (everything else came from the cache)")
    if review or blocked:
        sys.exit(2)  # held-back recipes are a failure of the run, not a footnote


if __name__ == "__main__":
    main()
