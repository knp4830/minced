"""Household-weight derivation from USDA portion records (offline, deterministic).

A port of the rules in nutrition.py (M1.5.4) onto the bulk-CSV record shape
(`portions`: amount / unit / modifier / description / grams), so the seed generator and the
old per-recipe script agree. Nothing here guesses: a unit with no matching USDA portion
returns None and stays a gap.
"""
import re
import statistics

# volume unit -> millilitres per unit (matches the `units` table's to_base_factor)
VOL_ML = {"tsp": 4.92892, "tbsp": 14.7868, "cup": 236.588, "fl oz": 29.5735}
COUNT_UNITS = ("clove", "head", "stalk", "fillet", "can", "bunch", "piece", "portion", "slice")

_VOL_RE = re.compile(r"^\s*(fl\.? ?oz|fluid ounces?|tsp|teaspoons?|tbsp|tablespoons?|cups?)\b")
_VOL_NORM = {"tsp": "tsp", "teaspoon": "tsp", "teaspoons": "tsp", "tbsp": "tbsp", "tablespoon": "tbsp",
             "tablespoons": "tbsp", "cup": "cup", "cups": "cup", "fl oz": "fl oz", "floz": "fl oz",
             "fl. oz": "fl oz", "fl.oz": "fl oz", "fluid ounce": "fl oz", "fluid ounces": "fl oz"}

# A label naming a PART of the item, never the whole thing: 'each' ("1 onion") must never pick one.
PART_WORDS = re.compile(
    r"\b(strips?|slices?|pieces?|wedges?|leaf|leaves|sprigs?|rings?|halves|half|quarters?|florets?|"
    r"stalks?|cloves?|sticks?|spears?|segments?|sections?|sheets?|links?|patt(?:y|ies)|"
    r"cup|cups|can|cans|pods?|fillets?|chunks?|cubes?|rib|ribs|bulb|sliced|chopped|diced|shredded|grated|mashed|crumbled)\b"
)
EACH_WORDS = ("medium", "large", "whole", "fruit", "each", "head")


def label(p):
    """Everything USDA says about the measure, lower-cased: unit, modifier, description."""
    unit = p["unit"] if p["unit"] not in ("undetermined",) else ""
    return " ".join(x for x in (unit, p["modifier"], p["description"]) if x).lower().strip()


_FRAC = r"(\d+\s+\d+/\d+|\d+/\d+|\d*\.?\d+)"
# "serving 1/2 cup", "0.5 cup": the measure is a fraction of a cup, not one cup
_SERVING_RE = re.compile(r"^serving[s]?\s+" + _FRAC + r"\s*(cups?|tbsp|tsp|fl\.? ?oz)\b")


def _num(s):
    s = s.strip()
    if " " in s:
        whole, frac = s.split()
        a, b = frac.split("/")
        return float(whole) + float(a) / float(b)
    if "/" in s:
        a, b = s.split("/")
        return float(a) / float(b)
    return float(s)


def volume_spec(p):
    """-> (unit, quantity of that unit this portion weighs) or None. 'cup chopped' = (cup, amount);
    'serving 1/2 cup' = (cup, amount * 0.5)."""
    lab = label(p)
    m = _VOL_RE.match(lab)
    if m:
        return _VOL_NORM.get(m.group(1).replace("  ", " ")), (p["amount"] or 1)
    m = _SERVING_RE.match(lab)
    if m:
        u = _VOL_NORM.get(m.group(2).replace("  ", " ").rstrip("s") if m.group(2).startswith("cup") else m.group(2))
        if u:
            return u, (p["amount"] or 1) * _num(m.group(1))
    return None


def volume_unit(p):
    """-> canonical volume unit name for this portion, or None."""
    s = volume_spec(p)
    return s[0] if s else None


def volume_grams_per_unit(food):
    """{unit: median grams for ONE tsp/tbsp/cup/fl oz} from the food's own volume portions."""
    by = {}
    for p in food["portions"]:
        s = volume_spec(p)
        if s:
            by.setdefault(s[0], []).append(p["grams"] / s[1])
    return {u: statistics.median(v) for u, v in by.items()}


def density(food):
    """Median g/ml over every volume portion, or None."""
    ds = []
    for p in food["portions"]:
        s = volume_spec(p)
        if s:
            ds.append(p["grams"] / (s[1] * VOL_ML[s[0]]))
    return statistics.median(ds) if ds else None


def count_grams(food, unit):
    """Grams for ONE `unit` (a count word, or 'each') from USDA portions, or None."""
    cands = []
    for p in food["portions"]:
        lab = label(p)
        if re.match(r"\s*(fl oz|tsp|tbsp|cup|oz|g|lb|teaspoon|tablespoon|ounce|gram|pound|milliliter|liter|quart|pint|gallon)\b", lab):
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
