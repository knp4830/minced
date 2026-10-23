# Wave 12 "Minced original" recipes (Asian cuisines first, then Italian / European)

Pipeline (all offline, nothing writes to live):

    recipes/*.txt  +  sources/*.tsv  +  cuisines.txt   (hand-written, Minced's own words)
         |
         v   python -I scripts/originals/build_ingredients.py   -> supabase/seed-ingredients-w12.sql
         v   python -I scripts/originals/build.py               -> supabase/seed-originals-w12.sql
                                                                   docs/content/RECIPE-REVIEW-w12.md

Format of a recipe file: see the header of `recipes/korean.txt`. The strict gates are inherited from
`scripts/content/build_original.py`: every ingredient resolves exactly or by alias (no fuzzy), unit / cuisine / cookware
must exist, titles are checked against the catalog.

## Verification of "this is a real traditional dish"
Each dish has at least two independent sources in `sources/*.tsv` (different domains, an established cook or publisher
each time). The URLs are for the reviewer only; they are not stored in the database and no text is copied: wording,
quantities and steps are Minced's own. A dish whose two sources disagreed on the core ingredients was dropped or written
to the common core.

## Honest limits
- Times and servings are typical values for the technique, not measurements.
- Nutrition is computed by the database (`refresh_recipe_nutrients`) from the linked USDA / CoFID / CNF foods. A line with
  no trusted food (guanciale, dashi, nuoc cham, Chinese five spice, dried mango powder, ...) is listed in `nutrition_gaps`
  and the recipe is `partial` ("at least"); nothing is guessed. Frying oil lines are written as the amount absorbed.
- New ingredient: only `chunjang` (ASSI black bean paste, FDC 2010198). `fdc_search.py` is the polite FDC lookup.

## Helpers
`reload.sh <container>` rebuild and reload into a SNAPSHOT container; `q.sh <container> "<sql>"` quick query;
`check_vocab.py` lists recipe ingredient names that do not resolve; `work/` holds one-off edit scripts (kept for history).
