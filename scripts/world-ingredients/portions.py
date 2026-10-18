"""Turn USDA household weights (SR Legacy / Foundation food_portion rows) into ingredient_portions rows.

classify(rows) -> {unit_name_or_None: (grams_per_unit, note)}
  unit names match the `units` table: cup, tbsp, tsp, fl oz, clove, slice, stalk, head, bunch, fillet, piece, can.
  None = "each" (unit_id NULL): one whole item (medium preferred).
density(rows) -> g/ml from plain cup / tbsp / tsp / fl oz portions (median), or None.
label_portion(household, serving_size, unit, density) -> (unit, grams_per_unit, note) from a branded label.
"""
import re

ML = {"cup": 236.588, "tbsp": 14.7868, "tsp": 4.92892, "fl oz": 29.5735}
SIZE_RANK = {"medium": 0, "": 1, "large": 2, "small": 3, "extra large": 4, "jumbo": 5, "extra small": 6}
UNIT_PATTERNS = [
    ("fl oz", r"^fl\.?\s*oz"),
    ("cup", r"^cups?\b"),
    ("tbsp", r"^(tbsp|tablespoons?)\b"),
    ("tsp", r"^(tsp|teaspoons?)\b"),
    ("clove", r"^cloves?\b"),
    ("slice", r"^slices?\b"),
    ("stalk", r"^stalks?\b"),
    ("head", r"^heads?\b"),
    ("bunch", r"^bunch(es)?\b"),
    ("fillet", r"^fillets?\b"),
    ("piece", r"^pieces?\b"),
    ("can", r"^can\b"),
]
SIZES = ["extra large", "extra small", "jumbo", "large", "medium", "small"]


def _text(r):
    unit = (r.get("unit") or "").strip().lower()
    unit = "" if unit in ("undetermined", "each", "") else unit
    parts = [unit, (r.get("modifier") or "").strip().lower(), (r.get("descr") or "").strip().lower()]
    return " ".join(p for p in parts if p).strip()


def classify(rows):
    cands = {}  # unit -> list of (complexity, gpu, note)
    for r in rows:
        try:
            amount = float(r["amount"]) if r.get("amount") not in (None, "") else 1.0
            grams = float(r["grams"])
        except (TypeError, ValueError):
            continue
        if amount <= 0 or grams <= 0:
            continue
        t = _text(r)
        if not t or t.startswith("nlea") or "serving" in t and not re.match(r"^(cup|tbsp|tsp)", t):
            continue
        unit = None
        for name, pat in UNIT_PATTERNS:
            if re.match(pat, t):
                unit = name
                break
        gpu = grams / amount
        if unit is None:
            size = next((s for s in SIZES if t.startswith(s)), None)
            if size is not None:
                cands.setdefault(None, []).append((SIZE_RANK[size], gpu, t))
                continue
            first = t.split()[0] if t.split() else ""
            # an item noun used as the household unit ("egg", "banana", "ear", "pod", "fruit")
            if re.match(r"^(egg|fruit|banana|ear|pod|leaf|leaves|sprig|root|tuber|bulb|onion|potato|tomato|pepper|apple|orange|lemon|lime|carrot|"
                        r"beet|turnip|avocado|date|fig|plum|peach|pear|olive|nut|mushroom|link|patty|drumstick|breast|thigh|wing|fillet|"
                        r"steak|chop|sheet|stick|cake|roll|bun|cracker|strip|rib|clove|segment|wedge|cob)", first):
                cands.setdefault(None, []).append((SIZE_RANK[""] + 0.5, gpu, t))
            continue
        # complexity: plain wins (no comma/paren/extra words)
        extra = len(re.sub(r"^[a-z. ]+?(?=$|[,(])", "", t))
        cands.setdefault(unit, []).append((extra, gpu, t))
    out = {}
    for unit, lst in cands.items():
        lst.sort(key=lambda x: (x[0], x[1]))
        c, gpu, t = lst[0]
        out[unit] = (round(gpu, 3), "USDA household weight: " + t[:80])
    return out


def density(rows):
    vals = []
    for r in rows:
        try:
            amount = float(r["amount"]) if r.get("amount") not in (None, "") else 1.0
            grams = float(r["grams"])
        except (TypeError, ValueError):
            continue
        t = _text(r)
        for name in ("cup", "tbsp", "tsp", "fl oz"):
            pat = dict(UNIT_PATTERNS)[name]
            if re.match(pat, t) and re.fullmatch(r"(cups?|tbsp|tablespoons?|tsp|teaspoons?|fl\.?\s*oz)\s*(\(.*\))?", t):
                vals.append(grams / amount / ML[name])
    if not vals:
        return None
    vals.sort()
    d = vals[len(vals) // 2]
    return round(d, 3) if 0.05 < d < 3 else None


def label_portion(household, serving_size, unit, dens):
    """Parse a branded label household serving, e.g. '1 TBSP (15 mL)' / '2 tsp (10g)' / '1/4 cup (60g)'."""
    if not household:
        return None
    h = household.lower().strip()
    m = re.match(r"^(\d+(?:\.\d+)?(?:\s+\d+/\d+)?|\d+/\d+)\s*(tbsp|tablespoons?|tsp|teaspoons?|cups?|fl\.?\s*oz|slices?|pieces?|cloves?)\b", h)
    if not m:
        return None
    q = m.group(1)
    if " " in q:
        a, b = q.split()
        n, d = b.split("/")
        qty = float(a) + float(n) / float(d)
    elif "/" in q:
        n, d = q.split("/")
        qty = float(n) / float(d)
    else:
        qty = float(q)
    u = m.group(2)
    name = {"tbsp": "tbsp", "tablespoon": "tbsp", "tablespoons": "tbsp", "tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp",
            "cup": "cup", "cups": "cup", "slice": "slice", "slices": "slice", "piece": "piece", "pieces": "piece",
            "clove": "clove", "cloves": "clove"}.get(u.replace(".", "").replace(" ", ""), None)
    if u.replace(".", "").replace(" ", "") == "floz":
        name = "fl oz"
    if name is None or qty <= 0:
        return None
    grams = serving_size if unit == "g" else (serving_size * dens if dens else None)
    if not grams:
        return None
    # Wave 10 fixer: a volume weight must imply a believable density (0.1 to 2.5 g/ml). Rejects label typos and per-serving weights
    # that merely carry a volume word: fonio "4 cup" for 1/4 cup (0.05 g/ml), oolong tea 5 g "per cup" (a tea bag), kimchi base
    # 20 g "per tsp" (4 g/ml).
    ml = {"tsp": 4.92892, "tbsp": 14.7868, "cup": 236.588, "fl oz": 29.5735}.get(name)
    if ml and not 0.1 <= (grams / qty) / ml <= 2.5:
        return None
    return name, round(grams / qty, 3), "label: " + household[:70]
