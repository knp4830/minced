"""Wave 12, more brands: find widely sold, plain brand products for the ingredients we already have (FoodData Central Branded Foods, CC0).

    python -I scripts/nutrition/foods12/brands_w12.py search      # one FDC search per eligible ingredient (cached, about 1 request a second)
    python -I scripts/nutrition/foods12/brands_w12.py select      # apply every gate, write brands_accepted.json + review/brands-w12.csv

Needs the snapshot database (W10_CONTAINER, default w12foods-db), USDA_FDC_API_KEY in .env.local for `search`, and gathered.json (so the
reference food of an ingredient reflects the stand-in audit: an unmapped ingredient gets no brands, a relinked one is judged against the new food).
`select` needs no key: it reads the search cache (W12_CACHE) and writes brands_accepted.json (committed, so build_w12.py is reproducible offline).

A product is accepted for an ingredient only when ALL of these hold (each is a gate, nothing is averaged or guessed; a brand food is a real FDC id):
  1. US market, a serving in g or ml of at least 1.5, energy + protein + fat + carbohydrate + sodium reported, and the same plausibility
     and label-rounding gates the default foods passed (scripts/world-ingredients/quality.py).
  2. Its brand (brand_name or brand_owner) is on brand_allowlist.txt, and it has a displayable brand (brand_name, or a description that starts with it).
  3. The description names THIS ingredient and no longer ingredient name: "peanut butter" is never a butter, "spaghetti" is never "pasta"
     (longest name or alias in the description wins), and no other ingredient appears in it ("garlic pasta sauce" is not pasta sauce).
  4. Qualifiers agree both ways (unsalted, low sodium, fat free, 2%, whole wheat, cooked, smoked, sweetened ...): a product that carries a qualifier
     the ingredient name lacks, or lacks one the name has, is a different food.
  5. Its energy and macronutrients sit near the ingredient's own default food (kcal within max(25 percent, 20); each macro within max(35 percent, 3 g)).
     A liquid sold by volume is converted with the ingredient's density (ingredients.density_g_per_ml) and skipped when it has none.
Per ingredient and form at most eight products and two per brand; identical labels are one product; outliers against the group median are dropped.
"""
import glob
import hashlib
import json
import os
import re
import statistics
import string
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
os.environ.setdefault("W10_CONTAINER", "w12foods-db")
os.environ.setdefault("W10_REF_CONTAINER", os.environ["W10_CONTAINER"])
sys.path.insert(0, os.path.join(ROOT, "scripts", "world-ingredients"))
from fdcdb import rows  # noqa: E402
from quality import plausible, label_rounded_zero, MIN_SERVING, GLOBAL_EXCL, sane_nutrients, ZERO_OK, energy_exempt  # noqa: E402

CACHE_DIR = os.environ.get("W12_CACHE") or os.path.join(os.environ.get("TEMP", "/tmp"), "w12-cache")
SEARCH_DIR = os.path.join(CACHE_DIR, "brandsearch")
ELIGIBLE_AISLES = ("Pantry", "Dairy", "Other", "Protein", "Spices")
CATS_BAD = ["frozen dinners", "entrees", "pizza", "sandwiches", "candy", "ice cream", "snack", "cookies", "cakes", "chocolate",
            "chips", "appetizers", "wraps", "soda", "cooked & prepared", "deli", "frozen prepared", "combination meals", "pasta dinners", "sushi",
            "breakfast", "dough based", "savoury", "biscuits", "bars", "dinner mixes", "mexican dinner", "flavored rice dishes", "chili & stew",
            "prepared soups", "other soups", "canned soup", "frozen bread", "pies", "vegetarian frozen", "sweet bakery", "croissants", "gum",
            "puddings", "gelatin", "baby", "supplement", "vitamins", "weight control", "energy", "frozen patties", "frozen bacon", "frozen poultry",
            "frozen sausages", "pet food", "alcohol", "beer", "wine", "liquor", "juice", "drinks", "coffee", "tea", "kombucha", "yogurt/yogurt substitutes"]
BADTOK = __import__("collections").Counter()
BADEX = []
SAT = [0, 0]
DIAG2 = bool(os.environ.get("W12_DIAG2"))
DIAG = bool(os.environ.get("W12_DIAG"))  # keep products from brands that are not on the allowlist, to see which brands are being missed
MAX_PER_GROUP = 8
MAX_PER_BRAND = 2
MAX_TOTAL = 12  # brand links per ingredient, counting the ones already in the database

KNOWN_QUAL_WORDS = set()


# ---- qualifiers: nutritionally meaningful words. Both sides must carry the same set (NEUTRAL words are ignored).
QUALS = {
    "unsalted": r"unsalted|no salt|sweet cream", "sweetened": r"sweetened", "unsweetened": r"unsweetened|no sugar added|sugar free|sugarfree|zero sugar",
    "low sodium": r"low sodium|reduced sodium|lower sodium|less sodium|no salt added", "fat free": r"fat free|nonfat|non fat|skim|fat-free|zero fat",
    "1%": r"1%|1 percent|low fat|lowfat|low-fat", "2%": r"2%|2 percent|reduced fat|reduced-fat", "light": r"\blight\b|\blite\b|lighter|diet",
    "whole wheat": r"whole wheat|whole grain|multigrain|multi grain|wholegrain|whole-wheat", "cooked": r"cooked|ready to|microwav|steamed|precooked|instant|heat",
    "roasted": r"roasted|toasted|grilled|flame|bbq|barbecue|charred|broiled|baked|seared", "smoked": r"smoked|hickory|mesquite", "fried": r"fried|breaded|battered|crispy", "seasoned": r"seasoned|marinated|marinade|flavored|flavoured|spiced|glazed|stuffed|infused|rubbed",
    "dried": r"dried|dehydrated|freeze dried", "frozen": r"frozen", "pickled": r"pickled|brined|in brine|marinated",
    "decaf": r"decaf", "vanilla": r"vanilla", "protein": r"protein enriched|high protein|keto|low carb", "organic_sweet": r"\bsweet\b", "spicy": r"spicy|\bhot\b|jalapeno|chipotle|habanero",
    "raw": r"\braw\b", "cured": r"cured|salted cod|corned", "whole": r"\bwhole\b", "concentrate": r"concentrate|paste|puree",
}
FLUFF = set("""a an the of and in with from for to by or no added natural organic premium original classic traditional pure real gourmet authentic imported
product brand fresh homestyle style old fashioned family size pack can jar bottle box bag pouch carton container tub oz ounce lb pound ct count
grade fancy choice quality extra large small medium jumbo mini all purpose kosher non gmo gluten free vegan certified usa us american made pasteurized
homogenized vitamin d fortified enriched unbleached bleached unenriched sliced diced shredded grated crushed chopped minced halves pieces whole kernel
cut shaved ground fine coarse regular finely thin thick plain squeeze squeezable easy open lid ready serve sugar water salt""".split())
ALLOW_ADJ = set("""shelled lightly cane pulp chunk chunks salted skinless boneless bone wild caught farm raised fillet filet fillets loin portion pitted seedless ripe refined unrefined virgin cold pressed
expeller extra thin thick sliced shredded freshly crumbled soft hard firm silken medium mild plain unflavored simple traditional old world""".split())
EXTRA_OK = set("water salt sugar oil spring sea olive vegetable red white black green yellow brown golden dark light sweet hot mild extra virgin".split())


def _qual_words():
    out = set()
    for rx in QUALS.values():
        for w in re.findall(r"[a-z%]+", rx.replace("\b", " ")):
            if len(w) > 2:
                out.add(sing(w))
    return out


def norm_tokens(s):
    s = s.lower().replace("&", " and ").replace("'", "")
    toks = re.findall(r"[a-z0-9%]+", s)
    return [sing(t) for t in toks]


def sing(t):
    if len(t) <= 3 or t.endswith("ss") or t.endswith("us") or t.endswith("%"):
        return t
    if t.endswith("ies") and len(t) > 4:
        return t[:-3] + "y"
    if t.endswith(("ches", "shes", "xes", "sses", "oes")) and len(t) > 4:
        return t[:-2]
    if t.endswith("s"):
        return t[:-1]
    return t


# ----------------------------------------------------------------------------------------------------------- universe
def load_universe():
    """ingredients with at least one default food: reference nutrition per form, density, aliases. Reflects gathered.json."""
    ing = rows("""select i.id, i.canonical_name::text name, i.aisle_category aisle, i.density_g_per_ml::float dens, f.form, f.fdc_id,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1008)) kcal,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1003)) p,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1004)) f,
      (select amount_per_100g from usda_food_nutrients where fdc_id=f.fdc_id and nutrient_id=(select id from nutrients where fdc_nutrient_id=1005)) c,
      (select count(*) from ingredient_foods g join usda_foods u on u.fdc_id=g.fdc_id where g.ingredient_id=i.id and u.data_type='branded') nbrand
      from ingredients i join ingredient_foods f on f.ingredient_id=i.id and f.is_default""", db="postgres")
    aliases = rows("select a.alias::text alias, i.canonical_name::text name from ingredient_aliases a join ingredients i on i.id=a.ingredient_id", db="postgres")
    existing = {r["fdc_id"] for r in rows("select fdc_id from usda_foods where data_type='branded'", db="postgres")}
    g =json.load(open(os.path.join(HERE, "gathered.json"), encoding="utf-8")) if os.path.exists(os.path.join(HERE, "gathered.json")) else {}
    for t in g.get("targets", {}).values():  # a real label that became an ingredient's default through the stand-in audit is not also an extra brand
        for fid in (t.get("id"), (t.get("medoid") or {}).get("id")):
            if fid:
                existing.add(fid)
    return ing, aliases, existing, g


def decisions():
    import csv
    return {r["ingredient"]: r for r in csv.DictReader(open(os.path.join(HERE, "proxy_decisions.psv"), encoding="utf-8", newline=""), delimiter="|")}


def build_refs(ing, g, dec):
    """name -> {"aisle","dens","nbrand","refs":{form:{kcal,p,f,c}}}"""
    refs = {}
    for r in ing:
        e = refs.setdefault(r["name"], {"aisle": r["aisle"], "dens": r["dens"], "nbrand": r["nbrand"], "refs": {}})
        if r["kcal"] is None:
            continue
        e["refs"][r["form"]] = {"kcal": float(r["kcal"]), "p": float(r["p"] or 0), "f": float(r["f"] or 0), "c": float(r["c"] or 0)}
    for name, d in dec.items():
        if name not in refs:
            continue
        if d["action"] == "unmap":
            refs[name]["refs"] = {}
        elif d["action"] in ("relink", "reform"):
            t = g.get("targets", {}).get(name)
            if not t:
                refs[name]["refs"] = {}
                continue
            n = t.get("medoid", {}).get("n") if t["ref"].startswith("bm:") else t.get("n")
            form = "dried" if d["action"] == "reform" else "default"
            refs[name]["refs"] = {form: {"kcal": n["kcal"], "p": n["p"] or 0, "f": n["f"] or 0, "c": n["c"] or 0}} if n and n.get("kcal") is not None else {}
    return refs


# ----------------------------------------------------------------------------------------------------------- search
def api_key():
    k = os.environ.get("USDA_FDC_API_KEY")
    if k:
        return k
    for line in open(os.path.join(ROOT, ".env.local"), encoding="utf-8"):
        if line.startswith("USDA_FDC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no USDA_FDC_API_KEY")


def search_path(query, page):
    h = hashlib.sha1(("%s|%d" % (query, page)).encode()).hexdigest()[:16]
    return os.path.join(SEARCH_DIR, "%s.json" % h)


def trim(f):
    su = (f.get("servingSizeUnit") or "").lower()
    if f.get("marketCountry") not in (None, "United States") or su not in ("g", "grm", "ml", "mlt") or not f.get("servingSize"):
        return None
    nut = {}
    for x in f.get("foodNutrients", []):
        if x.get("nutrientId") is not None and x.get("value") is not None:
            nut[int(x["nutrientId"])] = float(x["value"])
    return {"id": f["fdcId"], "d": f.get("description") or "", "owner": f.get("brandOwner"), "brand": f.get("brandName"), "cat": f.get("foodCategory") or "",
            "gtin": f.get("gtinUpc"), "pub": (f.get("publishedDate") or f.get("modifiedDate") or "")[:10] or None, "ss": f.get("servingSize"),
            "su": "ml" if su in ("ml", "mlt") else "g", "hh": f.get("householdServingFullText"), "nut": nut}


def do_search(queries, key):
    os.makedirs(SEARCH_DIR, exist_ok=True)
    if os.environ.get("W12_SLICE"):  # "i/n": this worker takes every n-th query, so several workers share the list without overlap
        i, n = (int(x) for x in os.environ["W12_SLICE"].split("/"))
        queries = [q for k, q in enumerate(queries) if k % n == i]
    done = 0
    for q, page in queries:
        p = search_path(q, page)
        if os.path.exists(p):
            continue
        body = json.dumps({"query": q, "dataType": ["Branded"], "pageSize": 200, "pageNumber": page}).encode()
        res = None
        for attempt in range(6):
            try:
                req = urllib.request.Request("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=" + key, data=body, headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=90) as r:
                    res = json.load(r)
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 5:
                    print("FAILED", q, str(e)[:80])
                    res = None
                time.sleep(5 * (attempt + 1))
        if res is None:
            continue
        out = {"q": q, "page": page, "total": res.get("totalHits"), "foods": [t for t in (trim(f) for f in res.get("foods", [])) if t]}
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(out, fh)
        os.replace(tmp, p)
        done += 1
        if done % 50 == 0:
            print("searched", done, flush=True)
        time.sleep(1.0)
    print("search done:", done, "new requests")


def brand_queries():
    """one search per national brand on the allowlist (store brands and regional chains are reached through their ingredient searches)."""
    qs, skip = [], False
    for line in open(os.path.join(HERE, "brand_allowlist.txt"), encoding="utf-8"):
        t = line.strip()
        if t.startswith("#"):
            skip = ("Store brands" in t or "Regional and discount" in t) and "More national brands" not in t
            continue
        if t and not skip and t not in qs and len(t) >= 4:
            qs.append(t)
    return qs


def eligible(refs):
    out = []
    for name, e in sorted(refs.items()):
        if e["aisle"] in ELIGIBLE_AISLES and e["refs"] and len(name) >= 3:
            out.append(name)
    return out


# ----------------------------------------------------------------------------------------------------------- gates
def qualset(text):
    t = text.lower().replace("’", "'")
    return {k for k, rx in QUALS.items() if re.search(rx, t)}


_ALLOW_CACHE = {}
_ALLOW_NORM = []


def allow_rank(brand_text, allow):
    if not _ALLOW_NORM:
        _ALLOW_NORM.extend((" " + " ".join(norm_tokens(a)) + " ", a) for a in allow)
    if brand_text in _ALLOW_CACHE:
        return _ALLOW_CACHE[brand_text]
    toks = " " + " ".join(norm_tokens(brand_text)) + " "
    res = (None, None)
    for i, (a_norm, a) in enumerate(_ALLOW_NORM):
        if a_norm in toks:
            res = (i, a)
            break
    _ALLOW_CACHE[brand_text] = res
    return res


def select():
    KNOWN_QUAL_WORDS.update(_qual_words())
    ing, aliases, existing, g = load_universe()
    dec = decisions()
    refs = build_refs(ing, g, dec)
    allow = [l.strip().lower() for l in open(os.path.join(HERE, "brand_allowlist.txt"), encoding="utf-8") if l.strip() and not l.startswith("#")]
    allow = list(dict.fromkeys(allow))
    # phrase dictionary: normalised names and aliases of every ingredient
    phrase = {}
    for r in {x["name"] for x in ing}:
        phrase.setdefault(tuple(norm_tokens(r)), set()).add(r)
    for a in aliases:
        phrase.setdefault(tuple(norm_tokens(a["alias"])), set()).add(a["name"])
    single = {k[0] for k in phrase if len(k) == 1}
    maxn = max(len(k) for k in phrase)
    dens_of = {n: e["dens"] for n, e in refs.items()}
    names = eligible(refs)
    cands = []
    stats = {"products": 0, "gate_ref": 0, "gate_name": 0, "gate_extra": 0, "gate_qual": 0, "gate_band": 0, "gate_brand": 0, "gate_nutr": 0, "gate_cat": 0, "dup": 0}
    seen_id = set()
    eligible_names = set(names)

    def pool():
        """(ingredient the search was for, product). Ingredient searches first; then the brand sweeps (search_brands), whose products
        have no ingredient yet: the longest ingredient name in the description decides, and only when it is unambiguous."""
        for name in names:
            qpath = search_path(name, 1)
            if not os.path.exists(qpath):
                continue
            foods = json.load(open(qpath, encoding="utf-8"))["foods"]
            for pg in (2, 3):  # extra result pages fetched for ingredients that came up short (search2)
                if os.path.exists(search_path(name, pg)):
                    foods = foods + json.load(open(search_path(name, pg), encoding="utf-8"))["foods"]
            for f in foods:
                yield name, f
        for q in brand_queries():
            for pg in (1, 2, 3):
                if os.path.exists(search_path(q, pg)):
                    for f in json.load(open(search_path(q, pg), encoding="utf-8"))["foods"]:
                        yield None, f

    for name, f in pool():
        if True:
            stats["products"] += 1
            if f["id"] in existing or f["id"] in seen_id:
                stats["dup"] += 1
                continue
            toks = norm_tokens(f["d"])
            best = None
            for n in range(min(maxn, len(toks)), 0, -1):
                for i in range(0, len(toks) - n + 1):
                    key = tuple(toks[i:i + n])
                    if key in phrase:
                        best = (i, n, key)
                        break
                if best:
                    break
            if name is None:  # a brand-sweep product: its ingredient is the one its longest name says
                if not best or len(phrase[best[2]]) != 1 or next(iter(phrase[best[2]])) not in eligible_names:
                    stats["gate_name"] += 1
                    continue
                name = next(iter(phrase[best[2]]))
            e = refs[name]
            my_toks = tuple(norm_tokens(name))
            my_quals = qualset(name)
            low = f["d"].lower()
            if any(re.search(r"" + re.escape(c), (f["cat"] or "").lower()) and c not in name.lower() for c in CATS_BAD):
                stats["gate_cat"] += 1
                continue
            if any(x.strip() in low for x in GLOBAL_EXCL if x.strip() not in name.lower()):
                stats["gate_cat"] += 1
                continue
            # brand
            bt = f["brand"] or f["owner"] or ""  # the brand name decides; the owner only when the record has no brand name (a different company can sit behind a brand)
            rank, tok = allow_rank(bt, allow)
            brand_display = f["brand"]
            if rank is None and not DIAG:
                stats["gate_brand"] += 1
                continue
            if rank is None:
                rank = 9999
            if not brand_display and rank == 9999:
                brand_display = f["owner"] or "?"
            if not brand_display:
                first = " ".join(norm_tokens(f["d"]))
                if not (first + " ").startswith(" ".join(norm_tokens(tok)) + " "):
                    stats["gate_brand"] += 1
                    continue
                brand_display = string.capwords(tok)  # the description starts with the brand ("KIKKOMAN SOY SAUCE"), so the brand is known
            # name: the longest ingredient phrase in the description is THIS ingredient
            if not best or phrase[best[2]] != {name}:
                stats["gate_name"] += 1
                continue
            i0, n0, _ = best
            rest = toks[:i0] + toks[i0 + n0:]
            btoks = set(norm_tokens(bt)) | set(norm_tokens(brand_display or ""))
            rest = [t for t in rest if t not in btoks and t not in FLUFF and t not in set(my_toks) and not t.replace("%", "").isdigit()]
            # every word left over must be harmless: another ingredient ("garlic"), or any word we do not know ("beans", "pancake", "sprouted"), is a different product
            bad = [t for t in rest if t not in EXTRA_OK and t not in ALLOW_ADJ and t not in KNOWN_QUAL_WORDS and not (t == "cheese" and e["aisle"] == "Dairy")]
            if bad:
                stats["gate_extra"] += 1
                BADTOK.update(bad)
                if DIAG2 and rank != 9999:
                    BADEX.append((name, f["d"][:70], tuple(bad)))
                continue
            if qualset(f["d"]) != my_quals and not (qualset(f["d"]) <= {"organic_sweet", "whole", "raw", "concentrate"} and my_quals <= {"organic_sweet", "whole", "raw", "concentrate"}):
                stats["gate_qual"] += 1
                continue
            # nutrition
            m = {int(k): v for k, v in f["nut"].items()}
            for alt in (2047, 2048):
                if 1008 not in m and alt in m:
                    m[1008] = m[alt]
            m.pop(2047, None)
            m.pop(2048, None)
            ss = float(f["ss"])
            dens = None
            if f["su"] == "ml":
                dens = dens_of.get(name)
                if not dens:
                    stats["gate_nutr"] += 1
                    continue
                m = {k: v / dens for k, v in m.items()}
            for k in (1003, 1004, 1005):  # label rounding on an oil serving (14 g fat in a 13.6 g spoon): up to 112 g is clamped to the physical 100, as the 10c seed does
                if 100 < (m.get(k) or 0) <= 112:
                    m[k] = 100.0
            if 902 < (m.get(1008) or 0) <= 1010:
                m[1008] = 900.0
            m = sane_nutrients(m)
            est = 4 * (m.get(1003) or 0) + 4 * (m.get(1005) or 0) + 9 * (m.get(1004) or 0)
            dev = abs((m.get(1008) or 0) - est)
            if not energy_exempt(name) and est > 0 and dev > (max(0.12 * est, 12) if ss < 8 else max(0.2 * est, 20)):
                stats["gate_nutr"] += 1  # the label's own energy disagrees with its own macros (stricter than the default-food gate: these are extras, so we can afford to skip doubtful ones)
                continue
            if any(m.get(k) is None for k in (1008, 1003, 1004, 1005, 1093)) or ss < MIN_SERVING or not plausible(m, ss, name) or label_rounded_zero(m, ss, name):
                stats["gate_nutr"] += 1
                continue
            if m[1008] == 0 and not any(m[1008] == 0 and rf["kcal"] < 10 for rf in e["refs"].values()) and name not in ZERO_OK:
                stats["gate_nutr"] += 1  # a label that rounds a tiny serving to 0 kcal is not a measurement of a food that has energy
                continue
            # near the default food
            best_form, best_dev = None, None
            dtoks = set(toks)
            for form, rf in e["refs"].items():
                # a form that carries a qualifier (low sodium, whole wheat, cooked, lean 85) is only for products that SAY so
                if form != "default" and not all(sing(t) in dtoks for t in re.findall(r"[a-z0-9%]+", form.lower().replace("_", " "))):
                    continue
                dk = abs(m[1008] - rf["kcal"])
                okk = dk <= max(0.25 * rf["kcal"], 20)
                okm = all(abs((m.get(nid) or 0) - rf[k]) <= max(0.35 * rf[k], 3.0) for nid, k in ((1003, "p"), (1004, "f"), (1005, "c")))
                if okk and okm and (best_dev is None or dk < best_dev):
                    best_form, best_dev = form, dk
            if best_form is None:
                stats["gate_band"] += 1
                continue
            seen_id.add(f["id"])
            cands.append({"ingredient": name, "form": best_form, "rank": rank, "brand_token": tok, "brand_display": brand_display, "f": f, "m": m, "dens": dens,
                          "kdev": round(best_dev, 1)})
    # ---- choose per (ingredient, form)
    groups = {}
    for c in cands:
        groups.setdefault((c["ingredient"], c["form"]), []).append(c)
    accepted, dropped_outlier = [], 0
    for (name, form), lst in groups.items():
        lst.sort(key=lambda c: (c["rank"], len(c["f"]["d"]), c["f"]["id"]))
        # identical labels are one product
        sig_seen, uniq = set(), []
        for c in lst:
            m = c["m"]
            sig = (round(m[1008]), round(m[1003], 1), round(m[1004], 1), round(m[1005], 1), round(m.get(1093, 0), -1))
            if sig in sig_seen or (c["f"]["gtin"] and ("g", c["f"]["gtin"]) in sig_seen):
                continue
            sig_seen.add(sig)
            if c["f"]["gtin"]:
                sig_seen.add(("g", c["f"]["gtin"]))
            uniq.append(c)
        if len(uniq) >= 4:
            med = statistics.median([c["m"][1008] for c in uniq])
            keep = [c for c in uniq if abs(c["m"][1008] - med) <= max(0.35 * med, 25)]
            dropped_outlier += len(uniq) - len(keep)
            uniq = keep
        per_brand, chosen = {}, []
        room = max(0, MAX_TOTAL - refs[name]["nbrand"])
        for c in uniq:
            b = (c["f"]["brand"] or c["brand_display"] or "").lower()
            if per_brand.get(b, 0) >= MAX_PER_BRAND:
                continue
            if len(chosen) >= min(MAX_PER_GROUP, room):
                break
            per_brand[b] = per_brand.get(b, 0) + 1
            chosen.append(c)
        accepted += chosen
        SAT[0] += len(uniq)
        SAT[1] += len(chosen)
    if DIAG:
        from collections import Counter
        cc = Counter((c["f"]["brand"] or c["f"]["owner"] or "").lower() for c in cands if c["rank"] == 9999)
        print("unlisted brands among otherwise accepted products:", cc.most_common(120))
        return
    if DIAG2:
        print("top leftover words:", BADTOK.most_common(150))
        import random
        random.seed(5)
        for x in random.sample(BADEX, 40):
            print(x)
    out = []
    for c in sorted(accepted, key=lambda c: (c["ingredient"], c["form"], c["rank"], c["f"]["id"])):
        f = c["f"]
        out.append({"ingredient": c["ingredient"], "form": c["form"], "fdc_id": f["id"], "description": f["d"][:200], "brand_name": c["brand_display"],
                    "brand_owner": f["owner"], "brand_token": c["brand_token"], "category": f["cat"], "serving_size": round(float(f["ss"]), 2), "serving_unit": f["su"],
                    "household": f["hh"], "published": f["pub"], "gtin": f["gtin"], "density_used": c["dens"], "kcal_dev_from_default": c["kdev"],
                    "nutrients_per_100g": {str(k): round(v, 4) for k, v in sorted(c["m"].items())}})
    json.dump(out, open(os.path.join(HERE, "brands_accepted.json"), "w", encoding="utf-8", newline="\n"), indent=0, ensure_ascii=False)
    import csv
    os.makedirs(os.path.join(ROOT, "scripts", "nutrition", "review"), exist_ok=True)
    with open(os.path.join(ROOT, "scripts", "nutrition", "review", "brands-w12.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ingredient", "form", "fdc_id", "brand", "description", "category", "serving", "kcal_per_100g", "protein_g", "fat_g", "carbs_g", "sodium_mg",
                    "ingredient_default_kcal", "published", "density_used"])
        for o in out:
            n = o["nutrients_per_100g"]
            rf = refs[o["ingredient"]]["refs"][o["form"]]
            w.writerow([o["ingredient"], o["form"], o["fdc_id"], o["brand_name"], o["description"], o["category"], "%s %s" % (o["serving_size"], o["serving_unit"]),
                        n.get("1008"), n.get("1003"), n.get("1004"), n.get("1005"), n.get("1093"), round(rf["kcal"]), o["published"], o["density_used"] or ""])
    print("eligible ingredients:", len(names), "| searched:", sum(1 for n in names if os.path.exists(search_path(n, 1))))
    print("candidates before the caps:", SAT[0], "after:", SAT[1])
    print("gates:", stats, "| outliers dropped:", dropped_outlier)
    print("accepted brand foods:", len(out), "for", len({o["ingredient"] for o in out}), "ingredients")


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "select"
    if mode == "search":
        ing, aliases, existing, g = load_universe()
        refs = build_refs(ing, g, decisions())
        qs = [(n, 1) for n in eligible(refs)]
        extra = os.path.join(HERE, "brand_extra_queries.txt")
        if os.path.exists(extra):
            qs += [(l.strip(), 1) for l in open(extra, encoding="utf-8") if l.strip() and not l.startswith("#")]
        if os.environ.get("W12_REVERSE"):  # a second worker can start from the other end; both skip what is cached
            qs = qs[::-1]
        print("queries:", len(qs), "| already cached:", sum(1 for q, p in qs if os.path.exists(search_path(q, p))), flush=True)
        do_search(qs, api_key())
    elif mode == "search_brands":
        qs = [(q, pg) for q in brand_queries() for pg in (1, 2, 3)]
        if os.environ.get("W12_REVERSE"):
            qs = qs[::-1]
        print("brand queries:", len(qs), "| already cached:", sum(1 for q, p in qs if os.path.exists(search_path(q, p))), flush=True)
        do_search(qs, api_key())
    elif mode == "search2":
        # second and third result pages, only for ingredients whose first page was full and which still have room for brand foods
        acc = json.load(open(os.path.join(HERE, "brands_accepted.json"), encoding="utf-8"))
        have = {}
        for a in acc:
            have[(a["ingredient"], a["form"])] = have.get((a["ingredient"], a["form"]), 0) + 1
        ing, aliases, existing, g = load_universe()
        refs = build_refs(ing, g, decisions())
        qs = []
        for n in eligible(refs):
            p1 = search_path(n, 1)
            if not os.path.exists(p1):
                continue
            tot = json.load(open(p1, encoding="utf-8"))["total"] or 0
            got = sum(v for (i, f), v in have.items() if i == n)
            if tot > 200 and got < 4:
                qs.append((n, 2))
                if tot > 400 and got < 2:
                    qs.append((n, 3))
        if os.environ.get("W12_REVERSE"):
            qs = qs[::-1]
        print("page 2/3 queries:", len(qs), "| already cached:", sum(1 for q, p in qs if os.path.exists(search_path(q, p))), flush=True)
        do_search(qs, api_key())
    else:
        select()


if __name__ == "__main__":
    main()
