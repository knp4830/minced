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


def plausible(m):
    """m: {fdc nutrient_id: amount per 100 g}. Energy present, within Atwater tolerance of 4P+4C+9F, macros sane."""
    k, p, f, c = m.get(1008), m.get(1003), m.get(1004), m.get(1005)
    if None in (k, p, f, c) or min(k, p, f, c) < 0:
        return False
    if p + f + c > 105 or k > 930:
        return False
    est = 4 * p + 4 * c + 9 * f
    if k > 25 and abs(k - est) > 0.4 * k + 25:
        return False
    s = m.get(1093)
    return s is None or 0 <= s <= 45000


def label_rounded_zero(m, serving, ingredient):
    """A tiny serving that rounds every macro to zero is not a true zero (unless the ingredient really is zero)."""
    return ((m.get(1008) or 0) == 0 and (m.get(1003) or 0) + (m.get(1004) or 0) + (m.get(1005) or 0) == 0
            and (m.get(1093) or 0) < 500 and serving < 6 and ingredient not in ZERO_OK)


# Words that mean the product is a meal, snack or supplement rather than the ingredient itself.
GLOBAL_EXCL = ["sandwich", "pizza", "burrito", "casserole", "dinner", "candy", "cookie", "gummy", "gummies", "supplement",
               "pet food", "ice cream", "octopus", "glaze", "kit,", " kit", "kombucha", "cbd", "fries", "nuggets"]
