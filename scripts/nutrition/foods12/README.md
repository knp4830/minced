# Wave 12: trusted stand-ins and more brands

Two jobs, one seed (`supabase/seed-nutrition-w12-foods.sql`, generated, idempotent).

## 1. Stand-in audit (owner's rule)

A **stand-in** is a food we link to an ingredient because no record of the real thing exists ("no ube record, yam is used"). At the start of wave 12 there
were 305 (`ingredient_foods.is_proxy`). The rule: **keep a stand-in only when it is the same food in another form, or a very close relative whose nutrition is within
about 10 percent on calories and the main macronutrients. Otherwise use a trusted record or no record at all.** An honest "no nutrition data" beats a wrong number.

* `proxy_decisions.psv` is the source of truth: one line per ingredient, `ingredient|action|target|kind|code|note|evidence`.
  * `keep` + `same` (the record IS this food: kosher salt is salt, ancho chile is SR's dried ancho) clears the stand-in flag.
  * `keep` + `close` (a very close relative, verified within 12 percent / 5 kcal and 12 percent / 2.5 g per macro against EVERY figure in `evidence`) keeps the flag, so the label still says so.
  * `relink` to a trusted record, always a real record: USDA SR / Foundation / FNDDS, a real FoodData Central label (a medoid of the agreeing labels, or one id), UK CoFID, Canadian CNF. The flag is cleared.
  * `reform`: the record is real but it is another form (chervil: SR is dried chervil).
  * `unmap`: no trusted record; the ingredient stays, its recipes say "at least".
  * `evidence` is `sr:<fdc_id>`, `fndds:<id>`, `cofid:<code>`, `cnf:<code>`, `brand:<fdc_id>`, `sci:<fdc_id>` (the scientific name FDC itself records), `bm:<key>` (a strict FDC Branded search from `bm_specs.json`), or `oils` / `vinegars` (a fixed list in `gather_12.py`).
* `gather_12.py` (needs the snapshot DB, the FDC key and the FNDDS survey zip) writes `gathered.json`; `build_w12.py` checks the rule, stops on a violation, and writes the SQL plus `scripts/nutrition/review/proxy-audit-w12.csv` (every decision with both food records and their values).
* Where a record exists in CoFID / CNF / SR the stand-in is replaced, even for an ingredient no recipe uses yet (pangasius, rohu, snake gourd ...).

## 2. More brands

`brands_w12.py search` runs one FDC Branded search per eligible ingredient (cached outside the repo, about one request a second, the key allows 3,600 an hour);
`brands_w12.py select` applies the gates written at the top of that file and writes `brands_accepted.json` (committed: the build is reproducible offline) and
`scripts/nutrition/review/brands-w12.csv`. `brand_allowlist.txt` is the list of brands people buy (national brands first, then store brands). A brand food is a real
FDC id linked to the canonical ingredient with `is_default = false`; it never changes what a recipe computes unless a cook picks it.

## Order

`build_w12.py` -> `supabase/seed-nutrition-w12-foods.sql`, run after `seed-nutrition-10c-foods.sql` and before `seed-nutrition-zzzzz-math-10c.sql`
(see `scripts/nutrition/LIVE-STEPS.md`, Wave 12). Rebuild: `python -I scripts/nutrition/foods12/build_w12.py` (no key needed).
