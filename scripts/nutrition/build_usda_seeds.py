#!/usr/bin/env python3
"""Generate the wave-10 USDA seed files (data only, no DDL) from the bulk CSVs + curated mapping.

    python -I scripts/nutrition/download_bulk.py          # once
    python -I scripts/nutrition/build_usda_seeds.py       # writes supabase/seed-nutrition-usda*.sql and review/*.csv

Outputs (all idempotent upserts, loaded by the integrator AFTER the schema migrations):
  supabase/seed-nutrition-usda-1-foods.sql          usda_foods: all SR Legacy + Foundation (+ branded foods we link)
  supabase/seed-nutrition-usda-2-nutrients-NN.sql   usda_food_nutrients (chunked), per 100 g, RAW source ids
  supabase/seed-nutrition-usda-3-links.sql          ingredient_foods, ingredient_portions, densities, fry rule
  scripts/nutrition/review/ingredient-mapping-review.csv   every ingredient, its food, confidence, reason

Rules baked in:
  * nutrient rows are keyed through nutrients.fdc_nutrient_id (the 4-digit CSV id), never by guessed smallint ids;
  * vitamin D IU and Atwater energy are loaded RAW (hidden nutrients) - the schema converts at read time;
  * an unreported nutrient has NO row; a 0 in the CSV is a true zero and is kept;
  * ingredients are referenced by canonical_name, units by name, so the seed does not depend on ids.
"""
import csv
import json
import os
import re
import statistics
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapping  # noqa: E402
import portions as pt  # noqa: E402
import usda_bulk as ub  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SEED_DIR = os.path.join(REPO, "supabase")
REVIEW_DIR = os.path.join(HERE, "review")
CHUNK_BYTES = 3_500_000

KNOWN_COUNT = set(pt.COUNT_UNITS) | {"each"}
NEG = []  # (fdc_id, nutrient_id, value) negatives seen in the source data


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def num(v):
    return f"{v:.6g}"


def iso_date(s):
    if not s:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return None


def load_foods():
    foods = ub.load_all(("sr", "foundation"))
    for k, v in mapping.branded_cache().items():
        v = dict(v)
        v["nutrients"] = {int(a): b for a, b in v["nutrients"].items()}
        foods[k] = v
    return foods


def load_fndds_wanted(foods, wanted):
    """FNDDS only for foods we actually link (cooked / prepared forms)."""
    need = {w for w in wanted if w not in foods}
    if not need:
        return
    fn = ub.load_dataset("fndds")
    for w in need:
        if w in fn:
            foods[w] = fn[w]


# ----------------------------------------------------------------- links
def collect_links(ings):
    """-> links {(ingredient, form): dict}, alts [(ingredient, form, fdc, conf, note)]"""
    links = {}
    old = mapping.existing_map()
    for key, v in old.items():
        m = re.match(r"^(.+) \[(\w+)\]$", key)
        ing, form = (m.group(1), m.group(2)) if m else (key, "default")
        if ing not in ings:
            raise SystemExit(f"existing map names unknown ingredient {ing!r}")
        links[(ing, form)] = {
            "fdc": v["fdc_id"], "conf": "E", "note": v.get("note", ""), "basis": v.get("basis", ""),
            "unit_g": dict(v.get("unit_g", {})), "density": v.get("density_g_per_ml"), "origin": "existing",
        }
    data = mapping.load()
    for ing, form, fdc, conf, note, fn in data["foods"]:
        if ing not in ings:
            raise SystemExit(f"{fn}: unknown ingredient {ing!r}")
        if (ing, form) in links:
            raise SystemExit(f"{fn}: {ing} [{form}] is already mapped by the existing map")
        links[(ing, form)] = {"fdc": fdc, "conf": conf, "note": note, "basis": "", "unit_g": {}, "density": None,
                              "origin": "new", "src": "units"}
    # curated density / portions from the mapping files (default form)
    for ing, g, src, conf, note, fn in data["densities"]:
        L = links.get((ing, "default"))
        if L is None:
            raise SystemExit(f"{fn}: density for unmapped {ing!r}")
        L["density"] = g
        L["density_note"] = note
    port_src = {}
    for ing, unit, grams, src, conf, note, pform, fn in data["portions"]:
        L = links.get((ing, pform))
        if L is None:
            raise SystemExit(f"{fn}: portion for unmapped {ing!r} [{pform}]")
        L["unit_g"][unit] = grams
        port_src[(ing, pform, unit)] = (src, note)
    for (ing, form), L in links.items():
        L["port_src"] = {u: port_src[(ing, form, u)] for u in L["unit_g"] if (ing, form, u) in port_src}
    # 'same' copies
    sames = []
    for ing, other, conf, note, fn in data["sames"]:
        found = False
        for (o, form), L in list(links.items()):
            if o == other:
                found = True
                c = dict(L)
                c["conf"] = conf
                c["note"] = f"same as {other}: {note}"
                c["origin"] = "new"
                c["unit_g"] = dict(L["unit_g"])
                c["port_src"] = dict(L.get("port_src", {}))
                c["copy_of"] = other
                links[(ing, form)] = c
        if not found:
            raise SystemExit(f"{fn}: same {ing!r} -> {other!r} but {other!r} is unmapped")
        sames.append(ing)
    alts = [(ing, form, fdc, conf, note) for ing, form, fdc, conf, note, fn in data["alts"]]
    for ing, form, *_ in alts:
        if (ing, form) not in links:
            raise SystemExit(f"alt for {ing!r} [{form}] with no default food")
    return links, alts, data


# ----------------------------------------------------------------- derive
def derive(links, foods):
    """-> density{ing: (g_per_ml, source)}, portion rows list, notes"""
    portion_rows = []   # (ing, form, unit, grams, source, note)
    density = {}
    for (ing, form), L in sorted(links.items()):
        f = foods[L["fdc"]]
        cur = L["unit_g"]
        psrc = L.get("port_src", {})
        # count units + each
        for unit in sorted(KNOWN_COUNT):
            if unit in cur:
                src, note = psrc.get(unit, ("curated", L.get("note") or "curated gram weight"))
                if src not in ("curated", "us_can_size", "label", "usda"):
                    src = "curated"
                portion_rows.append((ing, form, unit, cur[unit], src, note))
                continue
            g = pt.count_grams(f, unit)
            if g:
                portion_rows.append((ing, form, unit, round(g, 2), "usda", "USDA household weight"))
        # curated keys outside the known units would be silently dropped: fail loudly
        for unit in sorted(set(cur) & set(pt.VOL_ML)):  # curated gram weight for a volume measure
            src, note = psrc.get(unit, ("curated", "curated gram weight"))
            portion_rows.append((ing, form, unit, cur[unit], src if src in ("curated", "us_can_size", "label", "usda") else "curated", note))
        extra = set(cur) - KNOWN_COUNT - set(pt.VOL_ML)
        if extra:
            raise SystemExit(f"{ing}: unknown curated unit(s) {extra}")
        # volume
        dens = L["density"]
        if form == "default":
            if dens:
                density[ing] = (dens, "curated")
            else:
                d = pt.density(f)
                if d:
                    density[ing] = (round(d, 3), "usda")
        else:
            if dens:
                for u, ml in pt.VOL_ML.items():
                    portion_rows.append((ing, form, u, round(dens * ml, 2), "curated", "curated density"))
            else:
                for u, g in sorted(pt.volume_grams_per_unit(f).items()):
                    portion_rows.append((ing, form, u, round(g, 2), "usda", "USDA household weight"))
    return density, portion_rows


# ----------------------------------------------------------------- sql
def write_foods_sql(path, foods, fdc_ids):
    rows = []
    for fid in sorted(fdc_ids):
        f = foods[fid]
        bt = f["data_type"]
        su = f.get("serving_size_unit")
        su = {"GRM": "g", "g": "g", "MLT": "ml", "ml": "ml"}.get(su, None) if su else None
        ss = f.get("serving_size")
        rows.append("(%d,%s,%s,%s,%s,%s,%s,%s,%s)" % (
            fid, q(f["description"]), q(bt),
            q(f["brand_owner"]) if f.get("brand_owner") else "null",
            q(f["brand_name"]) if f.get("brand_name") else "null",
            num(ss) if ss else "null", q(su) if su and ss else "null",
            q(f["household_serving"]) if f.get("household_serving") else "null",
            q(iso_date(f.get("publication_date"))) + "::date" if iso_date(f.get("publication_date")) else "null"))
    head = ("-- Wave 10 lane A: USDA FoodData Central foods (CC0). Generated by scripts/nutrition/build_usda_seeds.py. Idempotent.\n"
            "-- Source: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central (fdc.nal.usda.gov).\n"
            "-- SR Legacy (2018, final), Foundation Foods (2025-12), plus the Branded records we link (label data).\n")
    with open(path, "w", encoding="utf-8", newline="\n") as out:
        out.write(head)
        for i in range(0, len(rows), 1000):
            out.write("insert into usda_foods (fdc_id, description, data_type, brand_owner, brand_name, serving_size, serving_size_unit, household_serving, publication_date) values\n")
            out.write(",\n".join(rows[i:i + 1000]))
            out.write("\non conflict (fdc_id) do update set description = excluded.description, data_type = excluded.data_type,\n"
                      "  brand_owner = excluded.brand_owner, brand_name = excluded.brand_name, serving_size = excluded.serving_size,\n"
                      "  serving_size_unit = excluded.serving_size_unit, household_serving = excluded.household_serving,\n"
                      "  publication_date = excluded.publication_date;\n")
    return len(rows)


NUTR_HEAD = ("-- Wave 10 lane A: USDA nutrient values per 100 g (CC0). Generated by scripts/nutrition/build_usda_seeds.py. Idempotent.\n"
             "-- 'fid|nid:amt,nid:amt' packs one food per line; nid is the 4-digit FDC CSV nutrient id and is mapped through\n"
             "-- nutrients.fdc_nutrient_id. An unreported nutrient has no row. Vitamin D IU and Atwater energy are loaded raw.\n")


def nutr_stmt(lines):
    return ("insert into usda_food_nutrients (fdc_id, nutrient_id, amount_per_100g)\n"
            "select p.fid, n.id, p.amt from (\n"
            "  select split_part(l, '|', 1)::integer as fid, split_part(e, ':', 1)::integer as nid, split_part(e, ':', 2)::real as amt\n"
            "  from unnest(array[\n" + ",\n".join("    " + q(l) for l in lines) + "\n  ]) as l,\n"
            "  lateral unnest(string_to_array(split_part(l, '|', 2), ',')) as e\n"
            ") p join nutrients n on n.fdc_nutrient_id = p.nid\n"
            "where exists (select 1 from usda_foods u where u.fdc_id = p.fid)\n"
            "on conflict (fdc_id, nutrient_id) do update set amount_per_100g = excluded.amount_per_100g;\n")


def write_nutrient_sql(prefix, foods, fdc_ids):
    files, cur, size, idx, nrows = [], [], 0, 1, 0

    def flush():
        nonlocal cur, size, idx
        if not cur:
            return
        path = f"{prefix}{idx:02d}.sql"
        with open(path, "w", encoding="utf-8", newline="\n") as out:
            out.write(NUTR_HEAD)
            for i in range(0, len(cur), 250):
                out.write(nutr_stmt(cur[i:i + 250]))
        files.append(path)
        cur, size, idx = [], 0, idx + 1

    for fid in sorted(fdc_ids):
        n = foods[fid]["nutrients"]
        items = []
        for k, v in sorted(n.items()):
            if v < 0:
                # "by difference" values (carbohydrate) can come out a hair below zero; the schema forbids
                # negatives. A rounding artefact (> -0.5) is a true zero; anything larger is dropped (not reported).
                NEG.append((fid, k, v))
                if v < -0.5:
                    continue
                v = 0.0
            items.append((k, v))
        if not items:
            continue
        nrows += len(items)
        line = "%d|%s" % (fid, ",".join("%d:%s" % (k, num(v)) for k, v in items))
        cur.append(line)
        size += len(line) + 8
        if size >= CHUNK_BYTES:
            flush()
    flush()
    return files, nrows


def write_links_sql(path, links, alts, density, portion_rows, ings):
    L = []
    L.append("-- Wave 10 lane A: ingredient -> food links, household weights, densities. Generated by build_usda_seeds.py. Idempotent.\n"
             "-- Ingredients are referenced by canonical_name and units by name. Run after the foods and nutrients seeds.\n")
    # ingredient_foods
    vals = []
    for (ing, form), x in sorted(links.items()):
        vals.append("(%s,%s,%d,true)" % (q(ing), q(form), x["fdc"]))
    for ing, form, fdc, conf, note in alts:
        vals.append("(%s,%s,%d,false)" % (q(ing), q(form), fdc))
    L.append("insert into ingredient_foods (ingredient_id, form, fdc_id, is_default)\n"
             "select i.id, v.form, v.fdc, v.dflt from (values\n" + ",\n".join(vals) +
             "\n) as v(ing, form, fdc, dflt)\njoin ingredients i on i.canonical_name = v.ing\n"
             "join usda_foods f on f.fdc_id = v.fdc\n"
             "order by v.dflt desc\n"
             "on conflict (ingredient_id, form, fdc_id) do update set is_default = excluded.is_default;\n")
    # legacy ingredients.fdc_id column: fill where empty so the old column agrees with the default form
    v2 = ["(%s,%d)" % (q(ing), x["fdc"]) for (ing, form), x in sorted(links.items()) if form == "default"]
    L.append("update ingredients i set fdc_id = v.fdc\nfrom (values\n" + ",\n".join(v2) +
             "\n) as v(ing, fdc)\nwhere i.canonical_name = v.ing and i.fdc_id is null and exists (select 1 from usda_foods f where f.fdc_id = v.fdc);\n")
    # densities
    v3 = ["(%s,%s)" % (q(ing), num(d)) for ing, (d, src) in sorted(density.items())]
    L.append("update ingredients i set density_g_per_ml = v.d\nfrom (values\n" + ",\n".join(v3) +
             "\n) as v(ing, d)\nwhere i.canonical_name = v.ing and i.density_g_per_ml is null;\n")
    # portions
    v4 = ["(%s,%s,%s,%s,%s,%s)" % (q(ing), q(form), q(unit), num(g), q(src), q(note)) for ing, form, unit, g, src, note in portion_rows]
    for i in range(0, len(v4), 1500):
        L.append("insert into ingredient_portions (ingredient_id, form, unit_id, grams_per_unit, source, note)\n"
                 "select i.id, v.form, u.id, v.g, v.src, v.note from (values\n" + ",\n".join(v4[i:i + 1500]) +
                 "\n) as v(ing, form, unit, g, src, note)\njoin ingredients i on i.canonical_name = v.ing\n"
                 "left join units u on u.name = v.unit\n"
                 "where v.unit = 'each' or u.id is not null\n"
                 "on conflict (ingredient_id, form, (coalesce(unit_id, 0))) do update set\n"
                 "  grams_per_unit = excluded.grams_per_unit, source = excluded.source, note = excluded.note;\n")
    # frying-bath rule (was fry_retained in ingredient-map.json)
    L.append("insert into prep_rules (kind, pattern, ingredient_id, factor, note)\n"
             "select 'grams_factor', '\\mfr(y|ied|ying)\\M', i.id, 0.15,\n"
             "       'proposed: a frying bath is mostly discarded; the food keeps about 15 percent (USDA/industry range 8 to 25)'\n"
             "from ingredients i where i.canonical_name = 'vegetable oil'\n"
             "  and not exists (select 1 from prep_rules r where r.kind = 'grams_factor' and r.ingredient_id = i.id and r.pattern = '\\mfr(y|ied|ying)\\M');\n")
    # "1 can pinto beans, drained and rinsed" means the canned food. Only fires when the ingredient HAS a canned form.
    L.append("insert into prep_rules (kind, pattern, form, note)\n"
             "select 'form', '\\m(drained|rinsed)\\M', 'canned',\n"
             "       'proposed: a drained/rinsed line is the canned product; only applies to ingredients that have a canned form'\n"
             "where not exists (select 1 from prep_rules r where r.kind = 'form' and r.pattern = '\\m(drained|rinsed)\\M' and r.ingredient_id is null);\n")
    with open(path, "w", encoding="utf-8", newline="\n") as out:
        out.write("\n".join(L))


# ----------------------------------------------------------------- review csv
def write_review(links, alts, data, ings, foods, density, portion_rows):
    os.makedirs(REVIEW_DIR, exist_ok=True)
    skips = {s[0]: s[1] for s in data["skips"]}
    new_names = {ing for (ing, form), x in links.items() if x["origin"] == "new" and form == "default"}
    unmapped = set(skips)
    rows = []
    for name, i in ings.items():
        status = "existing" if (name, "default") in links and links[(name, "default")]["origin"] == "existing" else \
            "new" if name in new_names else "unmapped" if name in unmapped else "unmapped-unreviewed"
        rows.append((name, i, status))
    # impact order: recipe rows desc, then name; new and unmapped are reviewed in batches of 30
    rows.sort(key=lambda r: (r[2] not in ("new", "unmapped"), -r[1]["prows"], r[0]))
    with open(os.path.join(REVIEW_DIR, "ingredient-mapping-review.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["review_batch", "rank", "ingredient", "recipe_rows", "status", "form", "fdc_id", "usda_description",
                    "usda_type", "confidence", "reason", "alternates_linked"])
        rank = 0
        for name, i, status in rows:
            if status in ("new", "unmapped"):
                rank += 1
                batch = (rank - 1) // 30 + 1
            else:
                batch = ""
            ls = sorted((form, x) for (n, form), x in links.items() if n == name)
            alt_ids = [str(a[2]) for a in alts if a[0] == name]
            if not ls:
                w.writerow([batch, rank if status in ("new", "unmapped") else "", name, i["prows"], status, "", "", "", "", "",
                            skips.get(name, "not reviewed"), ""])
                continue
            for form, x in ls:
                fd = foods[x["fdc"]]
                w.writerow([batch, rank if status in ("new", "unmapped") else "", name, i["prows"], status, form, x["fdc"],
                            fd["description"], fd["data_type"], x["conf"] if status != "existing" else "E", x["note"],
                            " ".join(alt_ids) if form == "default" else ""])


def main():
    ings = {i["name"]: i for i in json.load(open(os.path.join(ub.BULK, "ings.json"), encoding="utf-8"))}
    foods = load_foods()
    links, alts, data = collect_links(ings)
    wanted = {x["fdc"] for x in links.values()} | {a[2] for a in alts}
    load_fndds_wanted(foods, wanted)
    missing = sorted(w for w in wanted if w not in foods)
    if missing:
        raise SystemExit(f"fdc ids not found in SR/Foundation/FNDDS/branded cache: {missing}")
    density, portion_rows = derive(links, foods)

    generic = {fid for fid, f in foods.items() if f["data_type"] in ("sr_legacy", "foundation")}
    seed_ids = generic | wanted
    os.makedirs(SEED_DIR, exist_ok=True)
    n_foods = write_foods_sql(os.path.join(SEED_DIR, "seed-nutrition-usda-1-foods.sql"), foods, seed_ids)
    for old in os.listdir(SEED_DIR):
        if old.startswith("seed-nutrition-usda-2-nutrients-"):
            os.remove(os.path.join(SEED_DIR, old))
    files, n_nut = write_nutrient_sql(os.path.join(SEED_DIR, "seed-nutrition-usda-2-nutrients-"), foods, seed_ids)
    write_links_sql(os.path.join(SEED_DIR, "seed-nutrition-usda-3-links.sql"), links, alts, density, portion_rows, ings)
    write_review(links, alts, data, ings, foods, density, portion_rows)
    with open(os.path.join(REVIEW_DIR, "curated-weights-review.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ingredient", "form", "unit", "grams_per_unit", "source", "note"])
        for ing, form, unit, g, src, note in sorted(portion_rows):
            if src != "usda":
                w.writerow([ing, form, unit, g, src, note])

    default_ings = {n for (n, f) in links if f == "default"}
    print(f"foods in seed: {n_foods}  (generic {len(generic)}, linked non-generic {len(seed_ids - generic)})")
    print(f"negative source values clamped/dropped: {len(NEG)} (dropped {sum(1 for x in NEG if x[2] < -0.5)})")
    print(f"nutrient rows: {n_nut}  files: {[os.path.basename(f) for f in files]}")
    print(f"ingredients with a default food: {len(default_ings)} of {len(ings)}  (existing {sum(1 for (n,f),x in links.items() if f=='default' and x['origin']=='existing')})")
    print(f"links: {len(links)} defaults/forms, {len(alts)} alternates; densities {len(density)}; portion rows {len(portion_rows)}")
    json.dump({"links": {f"{a}|{b}": x["fdc"] for (a, b), x in links.items()}}, open(os.path.join(ub.BULK, "links.json"), "w"))


if __name__ == "__main__":
    main()
