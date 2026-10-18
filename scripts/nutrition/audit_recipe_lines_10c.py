#!/usr/bin/env python3
"""Wave 10c: compare the raw MyPlate ingredient lines with the lines in the database and propose corrections.

Why this exists: the MyPlate importer kept only a parsed ingredient name, a quantity, a unit and the page's own
`<span class="notes">`. Everything else in the original line was dropped: "fat-free Italian dressing" became "italian
dressing", "1 can (10.75 ounces)" lost its size, "kale or collard greens (1 1/2 pounds)" became two lines of 1.5 lb each,
"medium"/"large" disappeared. Those losses are what pushed the computed calories away from USDA's published ones.

    python3 scripts/nutrition/audit_recipe_lines_10c.py --db-lines db-lines.json --out proposals.csv

Inputs
    scripts/myplate/cache/*.html     the archived pages (gitignored; scripts/myplate/fetch.sh fills it)
    --db-lines FILE                  JSON from scripts/nutrition/export_recipe_lines_10c.sql (psql -At -f ...)
Output
    CSV with one row per proposed change (see COLUMNS). A human reads it; the reviewed rows are committed as
    scripts/nutrition/review/recipe-line-fixes-10c.csv and turned into SQL by build_math_seed_10c.py.

The audit only PROPOSES. It never writes to a database.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import subprocess
import sys
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

COLUMNS = ["slug", "title", "sort_order", "ingredient", "action", "old_value", "new_value", "rule", "raw_line"]

# ----------------------------------------------------------------------------------------------------------------
# alignment of raw lines with database rows (monotone DP on token overlap)
# ----------------------------------------------------------------------------------------------------------------
STOP = set(
    """a an and or of the with without to for in on at as from into per about any each such cup cups tablespoon tablespoons tbsp
    teaspoon teaspoons tsp ounce ounces oz pound pounds lb lbs can cans package packages pinch dash slice slices clove cloves
    large small medium whole fresh dried dry ground chopped sliced minced diced shredded grated optional taste more less if
    desired plus divided cut halved quartered peeled seeded boneless skinless cooked uncooked canned frozen drained rinsed packed
    fat free low lite light reduced sodium salt added no non nonfat unsweetened unsalted stalk stalks head bunch piece pieces
    fluid us fl inch inches sprig sprigs""".split()
)


def stem(w: str) -> str:
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if re.search(r"(ss|us|is)$", w):
        return w
    if re.search(r"(ches|shes|xes|zes|sses|oes)$", w):
        return w[:-2]
    if w.endswith("s") and len(w) > 3:
        return w[:-1]
    return w


def toks(s: str, drop_stop: bool = True) -> list[str]:
    s = re.sub(r"[^a-z\s]", " ", s.lower())
    out = []
    for w in s.split():
        if drop_stop and (w in STOP or len(w) < 3):
            continue
        out.append(stem(w))
    return out


SYNONYMS = [  # (raw phrase, extra words that mean the same thing in our vocabulary)
    (r"green onions?", "scallion"), (r"spring onions?", "scallion"), (r"oatmeal|quick[- ]cooking oats|old[- ]fashioned oats", "rolled oat"),
    (r"bread crumbs?", "breadcrumb"), (r"whole[- ]wheat (buns?|bread|pitas?)", "sandwich bread pita bread hamburger bun"),
    (r"flour tortillas?", "flour tortilla"), (r"jalape.o", "jalapeno"), (r"garbanzo", "chickpea"), (r"hot dogs?", "frankfurter"),
]


def overlap(rawtxt: str, ing: str) -> float:
    import unicodedata
    rawtxt = unicodedata.normalize("NFKD", rawtxt).encode("ascii", "ignore").decode()
    extra = " ".join(w for rx, w in SYNONYMS if re.search(rx, rawtxt, re.I))
    rt = set(toks(rawtxt + " " + extra, False))
    it = toks(ing) or toks(ing, False)
    return min(1.0, sum(1 for t in it if t in rt) / max(1, min(len(it), 2)))


def align(raw_lines: list[dict], db_lines: list[dict]) -> list[tuple[int, list[dict]]]:
    R, D = len(raw_lines), len(db_lines)
    rtext = [(r["line"] + " " + (r.get("prep_note") or "")) for r in raw_lines]
    S = [[overlap(rtext[i], db_lines[j]["ing"]) for j in range(D)] for i in range(R)]
    NEG = -1e9
    dp = [[NEG] * (D + 1) for _ in range(R + 1)]
    bk: list[list] = [[None] * (D + 1) for _ in range(R + 1)]
    dp[0][0] = 0
    for i in range(R + 1):
        for j in range(D + 1):
            cur = dp[i][j]
            if cur == NEG:
                continue
            if i < R and cur - 0.8 > dp[i + 1][j]:
                dp[i + 1][j] = cur - 0.8
                bk[i + 1][j] = (i, j, "skipraw")
            if j < D and cur - 1.0 > dp[i][j + 1]:
                dp[i][j + 1] = cur - 1.0
                bk[i][j + 1] = (i, j, "skipdb")
            if i < R:
                for k in range(1, 4):
                    if j + k > D:
                        break
                    sc = sum(S[i][j + m] * 2 - 0.6 for m in range(k))
                    if cur + sc > dp[i + 1][j + k]:
                        dp[i + 1][j + k] = cur + sc
                        bk[i + 1][j + k] = (i, j, k)
    i, j = R, D
    out: dict[int, list[int]] = {}
    while i > 0 or j > 0:
        pi, pj, how = bk[i][j]
        if isinstance(how, int):
            out[pi] = list(range(pj, pj + how))
        i, j = pi, pj
    return [(ri, [db_lines[x] for x in out.get(ri, [])]) for ri in range(R)]


# ----------------------------------------------------------------------------------------------------------------
# raw quantity parsing
# ----------------------------------------------------------------------------------------------------------------
UNIT_MAP = {
    "cup": "cup", "cups": "cup", "c": "cup",
    "tablespoon": "tbsp", "tablespoons": "tbsp", "tbsp": "tbsp", "tbs": "tbsp", "tbsps": "tbsp",
    "teaspoon": "tsp", "teaspoons": "tsp", "tsp": "tsp", "tsps": "tsp",
    "ounce": "oz", "ounces": "oz", "oz": "oz",
    "pound": "lb", "pounds": "lb", "lb": "lb", "lbs": "lb",
    "pint": "pt", "pints": "pt", "quart": "qt", "quarts": "qt", "gallon": "gal", "gallons": "gal",
    "liter": "l", "liters": "l", "milliliter": "ml", "milliliters": "ml",
    "can": "can", "cans": "can", "clove": "clove", "cloves": "clove", "slice": "slice", "slices": "slice",
    "stalk": "stalk", "stalks": "stalk", "head": "head", "heads": "head", "bunch": "bunch", "piece": "piece", "pieces": "piece",
    "fillet": "fillet", "fillets": "fillet",
}
CONTAINERS = {"package", "packages", "pkg", "box", "boxes", "bag", "bags", "container", "containers", "jar", "jars", "bottle",
              "bottles", "carton", "cartons", "envelope", "envelopes", "packet", "packets"}
NUM = r"(\d+\s+\d+/\d+|\d+/\d+|\d+\.\d+|\d+)"


def to_float(s: str) -> float:
    s = s.strip()
    if " " in s:
        whole, frac = s.split()
        return float(whole) + float(Fraction(frac))
    return float(Fraction(s))


def parse_qty(line: str) -> tuple[float | None, str | None, str]:
    """-> (quantity, db unit name or None for 'each', how). `how` explains a container conversion."""
    t = line.strip().lower()
    t = re.sub(r"^us\s+", "", t)
    m = re.match(NUM + r"\s*(.*)$", t)
    if not m:
        return None, None, "no number"
    q = to_float(m.group(1))
    rest = m.group(2)
    # "1 (8 ounce) container ..." / "2 (15 ounce) cans"
    pm = re.match(r"\(\s*" + NUM + r"[- ]*(ounce|ounces|oz|pound|pounds|lb|fluid ounces|fl oz)[^)]*\)\s*(\w+)?", rest)
    if pm:
        size = to_float(pm.group(1))
        unit = UNIT_MAP.get(pm.group(2), None)
        if pm.group(2) in ("fluid ounces", "fl oz"):
            unit = "fl oz"
        word = pm.group(3) or ""
        if word in ("can", "cans"):
            return q, "can", f"can of {size:g} {unit}"
        return q * size, unit, f"{q:g} x {size:g} {unit} ({word or 'package'})"
    um = re.match(r"(us fluid ounces?|fluid ounces?|fl\.? oz\.?|[a-z]+)\b", rest)
    if um:
        w = um.group(1)
        if re.match(r"(us fluid|fluid|fl\.? ?oz)", rest):
            return q, "fl oz", ""
        if w in UNIT_MAP:
            # "1 can (15.5 ounces) beans" keeps the can; "10-ounce packages" handled below
            return q, UNIT_MAP[w], ""
        if w in CONTAINERS:
            sm = re.search(r"\(\s*" + NUM + r"[- ]*(ounce|ounces|oz|pound|pounds|lb)", rest)
            if sm:
                return q * to_float(sm.group(1)), UNIT_MAP[sm.group(2)], f"{q:g} x {sm.group(1)} {sm.group(2)} ({w})"
            return None, None, "container without size"
    # "1 1/2 10-ounce packages of frozen corn"
    tm = re.match(NUM + r"[- ](ounce|ounces|oz|pound|pounds|lb)\s+(\w+)", rest)
    if tm and tm.group(3) in CONTAINERS | {"can", "cans"}:
        return q * to_float(tm.group(1)), UNIT_MAP[tm.group(2)], f"{q:g} x {tm.group(1)} {tm.group(2)}"
    return q, None, "each"


# ----------------------------------------------------------------------------------------------------------------
# lost qualifiers
# ----------------------------------------------------------------------------------------------------------------
QUAL_RX = [
    ("fat_free", re.compile(r"\b(fat[- ]free|non-?fat|skim)\b", re.I)),
    ("low_fat", re.compile(r"\b(low[- ]?fat|reduced[- ]?fat|light|lite|part[- ]skim|reduced[- ]calorie)\b", re.I)),
    ("low_sodium", re.compile(r"\b(low[- ]sodium|reduced[- ]sodium|lower[- ]sodium|no[- ]salt[- ]added|salt[- ]free|reduced sodium)\b", re.I)),
    ("unsweetened", re.compile(r"\b(unsweetened|no sugar added|sugar[- ]free)\b", re.I)),
    ("unsalted", re.compile(r"\bunsalted\b", re.I)),
    ("lean", re.compile(r"\b(\d\d%\s+lean|extra[- ]lean|lean)\b", re.I)),
    ("whole_wheat", re.compile(r"\b(whole[- ]wheat|whole[- ]grain)\b", re.I)),
    ("skinless", re.compile(r"\b(boneless|skinless)\b", re.I)),
    ("cooked", re.compile(r"(?<!un)\bcooked\b", re.I)),
    ("uncooked", re.compile(r"\buncooked\b", re.I)),
    ("canned", re.compile(r"\b(canned|juice[- ]packed|packed in (juice|water))\b", re.I)),
    ("frozen", re.compile(r"\bfrozen\b", re.I)),
    ("dried", re.compile(r"\bdried\b", re.I)),
    ("concentrate", re.compile(r"\bconcentrate(?:d)?\b", re.I)),
]
SIZE_RX = re.compile(r"\b(small|medium|large|extra[- ]large|jumbo)\b", re.I)


HEAD_NOUNS = ["oil", "sauce", "paste", "juice", "powder", "flour", "broth", "stock", "milk", "cheese", "syrup", "vinegar", "extract",
              "butter", "cream", "mix", "dressing", "soup", "bread", "noodles", "pudding", "seasoning", "jam", "jelly", "crumbs", "chips"]
CHEESES = {"ricotta", "parmesan", "mozzarella", "feta", "monterey jack", "cheddar", "romano", "swiss", "provolone", "gouda", "colby",
           "goat cheese", "blue cheese", "gruyere", "pepper jack", "asiago", "string cheese", "shredded cheese", "queso fresco", "cotija"}
HERBS = "basil|chives|cilantro|dill|mint|oregano|parsley|rosemary|sage|tarragon|thyme"
# (raw line pattern, database ingredient it was resolved to, the ingredient it should have been, why)
SWAPS = [
    (rf"\bdried (?:crushed |ground |leaf |rubbed )?({HERBS})\b", rf"fresh ({HERBS})", None, "dried herb resolved to the fresh one"),
    (r"\bturkey bacon\b", r"bacon", "turkey bacon", "turkey bacon is not pork bacon"),
    (r"\b(canned|cans?)\b.*\b(peaches|peach)\b|\b(peaches|peach)\b.*\bcans?\b", r"peach", "canned peaches", "canned fruit resolved to the fresh fruit"),
    (r"\b(canned|cans?)\b.*\b(pears|pear)\b|\b(pears|pear)\b.*\bcans?\b", r"pear", "canned pears", "canned fruit resolved to the fresh fruit"),
    (r"^(?!.*\b(dried|craisins?|sweetened)\b).*\bcranberr", r"dried cranberries", "fresh cranberries", "cranberries not called dried are the fresh berry"),
    (r"\bhot (?:chili |chile )?peppers?\b", r"black pepper", "chili peppers", "hot pepper resolved to black pepper"),
]


# "light" is also a kind of sugar, soy sauce, olive oil, cream and tuna; none of those is a low-fat version of anything
NOT_A_QUALIFIER = re.compile(r"light(?:ly)?[- ](brown|corn|olive|soy|red|cream|tuna|meat)|lite salt|light and fluffy|extra[- ]light", re.I)
# fat words only mean something for foods that come in fat levels
FAT_FOODS = re.compile(
    r"milk|yogurt|cheese|cream|mayo|dressing|whipped|topping|butter|margarine|ricotta|cottage|sausage|bacon|ham|turkey|beef|pork|"
    r"tofu|spread|pudding|ice cream|custard|cocoa|half and half|crust|dip", re.I)
SPICY_AISLES = {"Spices"}


_CATALOG: set | None = None


def catalog() -> set:
    """(ingredient, form) pairs in review/qualifier-foods-10c.csv: the forms the rules can pick."""
    global _CATALOG
    if _CATALOG is None:
        _CATALOG = set()
        path = os.path.join(HERE, "review", "qualifier-foods-10c.csv")
        if os.path.exists(path):
            with open(path, encoding="utf8", newline="") as f:
                for r in csv.DictReader(f):
                    _CATALOG.add((r["ingredient"], r["form"]))
    return _CATALOG


def worth_noting(fam: str, phrase: str, line: str, row: dict) -> bool:
    """Should this lost qualifier be written into the prep note? Only when it changes the food and a rule can read it."""
    ing = row["ing"] or ""
    if fam == "frozen":
        return (ing, "frozen") in catalog()  # only where a frozen food differs from the default (black-eyed peas)
    if fam == "uncooked":
        return False  # already the default state: no rule reads it, so it would only be noise
    if fam == "concentrate":
        return (ing, "concentrate") in catalog()
    if fam in ("low_fat", "fat_free"):
        if NOT_A_QUALIFIER.search(line) or not (FAT_FOODS.search(ing) or row.get("aisle") == "Dairy"):
            return False
        return True
    if fam == "low_sodium":
        return row.get("aisle") not in SPICY_AISLES  # a pinch of low-sodium adobo changes nothing we can state
    if fam == "dried":
        return False  # herbs: "dried basil" is decided by the ingredient swap, not a note
    if fam == "skinless":
        return ing in ("chicken thighs", "whole chicken", "chicken drumsticks")
    if fam == "lean":
        return ing in ("ground beef", "ground turkey")
    if fam == "canned" and "can" in line.lower() and re.search(r"\bcans?\b", line, re.I):
        return True
    return True


def phrases(text: str) -> dict[str, str]:
    out = {}
    for fam, rx in QUAL_RX:
        m = rx.search(text)
        if m:
            out[fam] = re.sub(r"\s+", " ", m.group(0).lower())
    return out


# ----------------------------------------------------------------------------------------------------------------
def load_raw(slugs: set[str] | None = None) -> dict[str, dict]:
    env = dict(os.environ, PYTHONUTF8="1")
    p = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "myplate", "extract.py")], cwd=ROOT, env=env,
                       capture_output=True, text=True, encoding="utf8")
    if p.returncode != 0:
        sys.exit(p.stderr[-2000:])
    return {r["slug"]: r for r in json.loads(p.stdout)}


def propose(raw: dict[str, dict], db: dict[str, dict]):
    rows: list[dict] = []
    review: list[dict] = []
    stats: dict[str, int] = {}

    def add(d, a, row, **kw):
        rows.append({"slug": d["slug"], "title": d["title"], "sort_order": row["ord"], "ingredient": row["ing"], "action": a, **kw})
        stats[kw["rule"]] = stats.get(kw["rule"], 0) + 1

    def flag(d, row, why, line):
        review.append({"slug": d["slug"], "title": d["title"], "sort_order": row["ord"], "ingredient": row["ing"], "action": "review",
                       "old_value": f"{row['q']} {row['unit']}", "new_value": "", "rule": why, "raw_line": line})

    for slug, r in raw.items():
        d = db.get(slug)
        if not d or not d.get("lines"):
            continue
        for ri, g in align(r["ingredients"], d["lines"]):
            rl = r["ingredients"][ri]
            if not g:
                continue
            line = rl["line"]
            rawtxt = line + " " + (rl.get("prep_note") or "")
            weak = [x for x in g if overlap(rawtxt, x["ing"]) < 0.5]
            if weak:
                for x in weak:
                    flag(d, x, "alignment uncertain: raw line shares too few words with this database row", line)
                continue
            have = " ".join(((x["ing"] or "") + " " + (x["note"] or "")) for x in g).lower()
            q_raw, u_raw, how = parse_qty(line)
            dash = bool(re.search(r"\b(dash|pinch)\b", line, re.I))

            if len(g) >= 2 and not re.search(r"\bor\b|,", line):
                for x in g:
                    flag(d, x, "several rows for one raw line without 'or': check by hand", line)
                continue
            g_main = g[0]
            # --- "A or B" alternatives: the first keeps the amount, the others become optional
            if len(g) >= 2:
                for x in g[1:]:
                    if not x["opt"]:
                        add(d, "optional", x, old_value="false", new_value="true", rule="alternatives: later options are optional", raw_line=line)
            if g_main["q"] is None and q_raw is not None and not dash and (u_raw is not None or how != "each"):
                add(d, "qty_unit", g_main, old_value="", new_value=f"{q_raw:g} {u_raw or ''}".strip(),
                    rule="alternatives: first option takes the amount" if len(g) >= 2 else f"quantity restored {how}".strip(), raw_line=line)
            elif (g_main["q"] is not None and q_raw is not None and not dash and len(g) == 1 and g_main["unit"] is None
                  and u_raw in ("oz", "lb") and " x " in how and re.search(r"\(\s*[\d.]+[- ]*(ounces?|oz)[^)]*each", line, re.I)):
                # "4 (6 ounces each) tilapia fillets": the importer kept the count and lost the weight of each
                old_q = float(g_main["q"])
                add(d, "qty_unit", g_main, old_value=f"{old_q:g}", new_value=f"{q_raw:g} {u_raw}", rule="weight of each restored (" + how + ")", raw_line=line)
            elif (g_main["q"] is not None and not dash and len(g) == 1 and g_main["unit"] is None and u_raw is None and q_raw is not None
                  and q_raw >= 2 and re.match(r"^(about|approximately|approx\.?)?\s*([\d.]+(?:\s\d/\d)?)\s*(pounds?|lbs?|ounces?|oz)\b\.?(\s+total)?\s*$", (rl.get("prep_note") or "").strip(), re.I)):
                # "4 potatoes (about 1 pound)": the importer counted four whole russets; the page says they weigh a pound
                wm = re.match(r"^(?:about|approximately|approx\.?)?\s*([\d.]+(?:\s\d/\d)?)\s*(pounds?|lbs?|ounces?|oz)", (rl.get("prep_note") or "").strip(), re.I)
                add(d, "qty_unit", g_main, old_value=f"{float(g_main['q']):g}", new_value=f"{to_float(wm.group(1)):g} {UNIT_MAP[wm.group(2).lower()]}",
                    rule=f"total weight stated on the page (\"{rl.get('prep_note')}\") replaces the count", raw_line=line)
            elif g_main["q"] is not None and q_raw is not None and not dash and len(g) == 1:
                # a stored amount that disagrees with the raw line is listed for a human, never changed here
                same_unit = (g_main["unit"] or None) == (u_raw or None)
                if same_unit and abs(float(g_main["q"]) - q_raw) > 0.02 * q_raw:
                    flag(d, g_main, f"amount differs from the raw line ({q_raw:g} {u_raw or 'each'})", line)
                elif not same_unit and (u_raw in ("cup", "tbsp", "tsp", "oz", "lb", "fl oz") or g_main["unit"] in ("cup", "tbsp", "tsp", "oz", "lb", "fl oz")):
                    flag(d, g_main, f"unit differs from the raw line ({q_raw:g} {u_raw or 'each'})", line)

            # --- lost qualifiers and sizes
            lost = {}
            for f, p in phrases(line).items():
                if re.search(re.escape(p).replace(r"\ ", r"[- ]"), have):
                    continue
                if not worth_noting(f, p, line, g_main):
                    continue
                lost[f] = p
            sizes = [m.lower() for m in SIZE_RX.findall(line) if m.lower() not in have]
            if (g_main["ing"] or "") in ("flour tortillas", "pita bread"):
                im = re.search(r"\b(\d{1,2})(?:[- ]?inch(?:es)?|\")", line + " " + (rl.get("prep_note") or ""))
                if im and f"{im.group(1)} inch" not in have:
                    sizes.insert(0, f"{im.group(1)} inch")  # USDA publishes tortilla and pita weights by diameter
            if lost or sizes:
                parts = []
                if sizes:
                    parts.append(sizes[0])
                parts.extend(lost.values())
                old_note = g_main["note"] or ""
                new_note = ", ".join(parts + ([old_note] if old_note else []))
                add(d, "note", g_main, old_value=old_note, new_value=new_note,
                    rule="lost qualifiers: " + ",".join(sorted(lost)) + (" size" if sizes else ""), raw_line=line)
            # --- a head noun on the page that the stored ingredient does not have ("corn oil" stored as corn)
            if len(g) == 1:
                name_part = re.sub(r"\([^)]*\)", " ", line.split(",")[0]).lower()
                for noun in HEAD_NOUNS:
                    ing_l = (g_main["ing"] or "").lower()
                    if not re.search(rf"\b{noun}\b", name_part) or re.search(rf"\b{noun}", ing_l):
                        continue
                    if noun == "juice" and ing_l in ("lemon", "lime", "canned peaches", "canned pears", "pineapple") and not re.search(r"(pineapple|peach|pear) juice", name_part):
                        continue  # the table holds lemon / lime JUICE for tbsp and cup lines; "pineapple chunks in juice" is the fruit
                    if noun == "cheese" and ing_l in CHEESES:
                        continue
                    if noun == "mix" and ing_l in ("egg substitute", "hot cocoa mix"):
                        continue
                    if noun == "crumbs" and ing_l in ("breadcrumbs", "graham crackers", "panko breadcrumbs"):
                        continue
                    if noun == "seasoning" and ing_l in ("lemon pepper", "salt"):
                        continue
                    flag(d, g_main, f"the page says '{noun}' but the stored ingredient does not", line)
                    break
            # --- the line was resolved to a different thing than it names
            pn = rl.get("prep_note") or ""
            swap_text = re.sub(rf"\b({HERBS})\b", r"dried \1", line, flags=re.I) if re.match(r"^(crushed, )?(dried|dry)\b", pn, re.I) else line
            for rx, dbpat, new, why in SWAPS:
                m = re.search(rx, swap_text, re.I)
                if not m or len(g) != 1:
                    continue
                if new is None:  # dried herb
                    hm = re.fullmatch(dbpat, g_main["ing"] or "")
                    if hm and hm.group(1).lower() == m.group(1).lower():
                        add(d, "ingredient", g_main, old_value=g_main["ing"], new_value="dried " + m.group(1).lower(), rule=why, raw_line=line)
                elif re.fullmatch(dbpat, g_main["ing"] or ""):
                    add(d, "ingredient", g_main, old_value=g_main["ing"], new_value=new, rule=why, raw_line=line)
            # --- milk: fat-free / 1% / whole are separate ingredients when named (owner decision)
            if (g_main["ing"] or "") == "milk" and len(g) == 1:
                if "fat_free" in lost:
                    add(d, "ingredient", g_main, old_value="milk", new_value="skim milk", rule="milk named fat-free is skim milk", raw_line=line)
                elif re.search(r"\b1\s?%", line):
                    add(d, "ingredient", g_main, old_value="milk", new_value="1% milk", rule="milk named 1% is 1% milk", raw_line=line)
                elif re.search(r"\bwhole milk\b", line, re.I):
                    add(d, "ingredient", g_main, old_value="milk", new_value="whole milk", rule="milk named whole is whole milk", raw_line=line)
    return rows + review, stats


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-lines", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    db = {r["slug"]: r for r in json.load(open(a.db_lines, encoding="utf8"))}
    raw = load_raw()
    rows, stats = propose(raw, db)
    with open(a.out, "w", newline="", encoding="utf8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in COLUMNS})
    print(f"{len(raw)} cached recipes, {len(rows)} proposals", file=sys.stderr)
    for k, v in sorted(stats.items(), key=lambda x: -x[1]):
        print(f"  {v:5d}  {k}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
