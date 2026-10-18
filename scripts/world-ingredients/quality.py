"""Label sanity rules shared by resolve.py (default foods) and brands.py (brand foods).

FDC Branded Foods values are label values converted to per 100 g. Labels round (energy to 5 or 10 kcal, grams to 0.5 g, anything under
0.5 g to 0), so a record with a tiny serving can show 0 or 400 kcal/100 g when the truth is far off. These rules drop records that cannot
be right and prefer records with a serving large enough to carry usable precision.
"""

ZERO_OK = {"salt", "kosher salt", "sea salt", "water", "baking soda", "stevia", "sucralose", "erythritol", "kala namak",
           "rock salt", "white vinegar", "rice vinegar", "apple cider vinegar", "red wine vinegar", "sherry vinegar",
           "coffee", "black tea", "green tea", "tabasco sauce", "hot sauce", "food coloring", "liquid smoke"}
MIN_SERVING = 1.5          # grams or ml; below this the label rounding dominates
PREFERRED_SERVING = 2.5    # default-food medoids prefer records at or above this


# Polyol and alcohol are not among the 38 tracked nutrients, so a food that legitimately has fewer (polyols) or more
# (alcohol, acetic acid) kilocalories than 4P+4C+9F says cannot be told apart by its numbers: allow by ingredient name.
ENERGY_EXEMPT = ("sweetener", "stevia", "erythritol", "monk fruit", "monkfruit", "xylitol", "allulose", "sugar substitute",
                 "wine", "beer", "sake", "mirin", "liqueur", "rum", "vodka", "whisk", "brandy", "cognac", "vermouth", "sherry",
                 "bourbon", "tequila", "vanilla", "extract", "bitters", "amaretto", "marsala", "vinegar")
MAX_KCAL = 902             # physical maximum: 9 kcal/g of pure fat = 900, plus a hair for rounding


def energy_exempt(ingredient):
    n = (ingredient or "").lower()
    return any(w in n for w in ENERGY_EXEMPT)


def plausible(m, serving=None, ingredient=None):
    """m: {fdc nutrient_id: amount per 100 g}. Energy present and consistent with 4P+4C+9F, macros sane.

    Wave 10 fixer: the old band (40 percent + 25 kcal) let 206 of 2,363 branded foods through with energy off by more than
    15 percent and 15 kcal. Now: a deviation over 25 percent AND over 15 kcal AND over the label-rounding allowance for the
    serving (about 6.75 kcal per serving, so 675 / serving_g per 100 g) rejects the food. A reported 0 kcal with macros that
    say at least 40 kcal/100 g is label rounding of a tiny serving ("express as zero"), not a true zero, and is rejected too.
    Exempt by ingredient name: polyol sweeteners and alcohol-bearing foods (see ENERGY_EXEMPT).
    """
    k, p, f, c = m.get(1008), m.get(1003), m.get(1004), m.get(1005)
    if None in (k, p, f, c) or min(k, p, f, c) < 0:
        return False
    if p + f + c > 105:
        return False
    if k > MAX_KCAL:
        k = MAX_KCAL  # label rounding on an oil serving (14 g fat in 13.6 g); the seed clamps the stored value
    est = 4 * p + 4 * c + 9 * f
    if not energy_exempt(ingredient):
        dev = abs(k - est)
        if k == 0 and est > 40:
            return False
        if dev > 0.25 * est and dev > 15 and (serving is None or dev > 675.0 / serving):
            return False
    s = m.get(1093)
    return s is None or 0 <= s <= 45000


def label_rounded_zero(m, serving, ingredient):
    """A tiny serving that rounds every macro to zero is not a true zero (unless the ingredient really is zero)."""
    return ((m.get(1008) or 0) == 0 and (m.get(1003) or 0) + (m.get(1004) or 0) + (m.get(1005) or 0) == 0
            and (m.get(1093) or 0) < 500 and serving < 6 and ingredient not in ZERO_OK)


def sane_nutrients(m):
    """Load-time sanity gate (wave 10 fixer). m: {FDC nutrient_id: amount per 100 g}. Returns a copy with impossible values
    REMOVED (absent = "not reported", never 0). Mirrors the rules in supabase/seed-nutrition-zzz-corrections.sql:
    cholesterol over 3,500 mg and B12 over 120 mcg are unit mistakes in the source (butter 214,286 mg); a sub-nutrient cannot
    exceed its parent (5 percent + 0.5 g of label rounding allowed): sugars, fibre and added sugars vs carbohydrate,
    saturated, trans, mono and poly fat vs total fat; energy is capped at 900 kcal (9 kcal/g of pure fat)."""
    out = dict(m)
    if (out.get(1253) or 0) > 3500:
        del out[1253]
    if (out.get(1178) or 0) > 120:
        del out[1178]
    carbs, fat, sug = out.get(1005), out.get(1004), out.get(2000)
    for sub, parent in ((2000, carbs), (1079, carbs), (1235, sug if sug is not None else carbs), (1258, fat), (1257, fat), (1292, fat), (1293, fat)):
        if sub in out and parent is not None and out[sub] > parent * 1.05 + 0.5:
            del out[sub]
    if (out.get(1008) or 0) > MAX_KCAL:
        out[1008] = 900.0
    return out


# Words that mean the product is a meal, snack or supplement rather than the ingredient itself.
GLOBAL_EXCL = ["sandwich", "pizza", "burrito", "casserole", "dinner", "candy", "cookie", "gummy", "gummies", "supplement",
               "pet food", "ice cream", "octopus", "glaze", "kit,", " kit", "kombucha", "cbd", "fries", "nuggets"]
