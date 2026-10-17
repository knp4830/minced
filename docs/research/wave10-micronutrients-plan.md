# Wave 10 plan: full vitamins and minerals, computed from USDA FoodData Central

Status: research and data audit only. Nothing was built, migrated or written to any live database. The audit ran on a throwaway snapshot container (`w10-audit`, removed). Date: 2026-10-16.

## 0. Bottom line

- The hard part is already half built. `scripts/nutrition/` (M1.5.4) converts a recipe line to grams and sums USDA per-100 g values for six nutrients. Wave 10 extends it from "6 nutrients, offline script, 106 recipes" to "about 24 nutrients, in Postgres, all recipes, and user recipes".
- The binding constraint is **ingredient coverage, not nutrient coverage**. Only 275 of 610 canonical ingredients have a USDA food (45%), and only 172 of 957 published recipes can be computed end to end today. Milk, margarine, raisins, banana, vanilla yogurt, cheddar, orange juice, broccoli, brown rice, black beans and chicken are all unmapped.
- Mapping about 150 more ingredients (by use) plus about 15 can/each weights takes rows from 75% to about 97%. That is curated human work (the repo's own lesson: auto-matching gave 17% median kcal error), not a coding problem.
- Use **SR Legacy as the primary source** (full micronutrients and household portions), Foundation only when a record is complete, FNDDS for cooked or mixed items and for added sugar, Branded only as a flagged last resort.
- Do not invent numbers. Every recipe gets a status (complete, partial, unavailable) and a per-nutrient coverage figure. "Not reported by USDA" is stored as NULL, never 0.

## 1. Data audit (snapshot of live, 957 published recipes)

### Schema today
| Thing | State |
|---|---|
| `recipes` nutrition | 6 columns per serving: `calories, protein_g, carbs_g, fat_g, sodium_mg, fiber_g`. No micronutrient storage anywhere, no nutrition table, no nutrition function (checked `pg_proc` and `information_schema`). |
| `ingredients` | 610 rows. `fdc_id int` (275 set), `density_g_per_ml` (43 set), `family_id`, `is_pantry_staple`. |
| `recipe_ingredients` | `quantity numeric` (NULL = to taste), `unit_id` (NULL = "each"), `prep_note`, `is_optional`. No grams column. |
| `units` | `kind` mass (4: g, kg, lb, oz), volume (9: tsp, tbsp, cup, fl oz, ml, l, pt, qt, gal), count (9: bunch, can, clove, fillet, head, piece, portion, slice, stalk), each with `to_base_factor`. |
| Offline curation | `scripts/nutrition/ingredient-map.json`: 282 entries (275 ingredients plus 7 `[cooked]/[dried]/[roasted]` forms), 81 with `unit_g`, 43 with `density_g_per_ml`. `cache/fdc-cache.json`: 236 foods (213 SR Legacy, 23 Branded), **trimmed to the six macros plus portions**, so micros need a re-fetch (236 calls, trivial). |
| Who has values | 851 MyPlate recipes carry USDA's published six values (all non-null). 106 others were computed by `nutrition.py` (all fully computable). |
| Me dashboard | `src/lib/me/dv.ts` does not exist yet; the mockup (`design/Minced-Me-Dashboard*.html`) lists the nutrients including added sugar, cholesterol, potassium, vitamins A, B6, B12, C, D, E, K, folate. |

### Recipe ingredient rows (8,145 rows in 957 published recipes)
| Row type | Rows | Mapped to FDC | Notes |
|---|---|---|---|
| volume unit | 5,173 | 3,851 | cup/tbsp/tsp; needs g/ml density |
| no unit (each) with quantity | 1,369 | 1,128 | "1 onion"; needs a per-item weight |
| count unit | 588 | 460 | can 270, clove 212, slice 39, stalk 36, head 25, other 6 |
| mass unit | 319 | 208 | trivially convertible |
| no quantity (to taste) | 696 | 449 | contributes 0 by design |
| **Total mapped** | **6,096 (74.8%)** | | 2,049 rows (230 distinct ingredients) unmapped |

Convertible to grams today, using the existing pipeline's rules, among the mapped rows that have a quantity: **5,520 convert (99.5%)**: 3,839 volume, 1,473 count/each, 208 mass. 127 fail: 115 count (tomato can 25, corn can 12, green beans can 9, pumpkin can 7, pineapple can 5, "chicken breast" each 12, chicken thighs each 6, bread each 5, broth can 4, salmon can 4) and 12 volume (no density: chicken breast cup 11, silken tofu cup 1).

So once an ingredient is mapped, unit conversion is nearly solved. The unmapped ingredient is the gap.

### Unmapped ingredient concentration
The top 50 unmapped ingredients cover 1,381 rows, the top 100 cover 1,779, the top 150 cover 1,939, the top 200 cover 2,019 of 2,049. Biggest: milk 120 rows, margarine 65, raisins 57, banana 51, vanilla yogurt 50, cheddar 48, orange juice 39, broccoli 39, brown rice 39, cooking spray 38, black beans 38, rolled oats 36, chicken 36, mixed vegetables 33, diced tomatoes 32, pasta 32. Several are the plain-name sibling of a mapped ingredient (`chicken` vs `chicken breast`) and need a decision, not just an id.

### Recipes fully computable today (every quantified row maps and converts)
| Group | Recipes | Fully computable | At most 1 gap | At most 2 gaps |
|---|---|---|---|---|
| Non-MyPlate | 106 | 106 | 106 | 106 |
| MyPlate | 851 | 66 | 226 | 448 |
| **All** | **957** | **172 (18%)** | 332 | 554 |

Estimate after mapping the top ~150 unmapped ingredients and ~15 can/each weights: 85 to 92% of recipes fully computable (extrapolated from the row concentration, not measured). The long tail stays "partial".

## 2. USDA FoodData Central research

Verified with about 8 read-only API calls (the rate-limit header showed 3,600 requests per hour per key). Items marked unverified come from memory of USDA docs and are listed in section 8.

### Datasets
| Dataset | Use for | Evidence |
|---|---|---|
| **SR Legacy** (final 2018, about 7,800 foods) | Primary. Raw staples with the full nutrient panel and household portions. | Garlic raw (169230): 96 nutrients, portions "1 clove = 3 g", "1 cup = 136 g", "1 tsp = 2.8 g". 213 of our 236 cached foods are SR Legacy already. |
| **Foundation Foods** | Only when the record is complete. | Garlic raw Foundation (1104647): only 15 nutrients and one "RACC" portion. Bison ground (2727571): 22 nutrients. Some are rich (cheddar 328637: 105 nutrients). Foundation also reports energy as Atwater 957/958, not 208; `fdc.py` already handles that. |
| **FNDDS (Survey)** | Cooked or mixed items and **added sugars**. | Cheddar FNDDS 2705709 had 65 nutrients. Added sugars (539) exists in FNDDS and Branded, not SR Legacy (garlic had none). |
| **Branded** | Last resort (gochujang, harissa, garam masala), flagged "label data". | Labels carry few micros (typically Ca, Fe, K, vitamin D, A and C). A micronutrient-poor Branded food makes every recipe that uses it "partial" for those nutrients. |

Curator rule: SR Legacy raw first; if the line is cooked, canned or dried, pick the matching SR Legacy entry; FNDDS when SR has nothing; Branded last.

### Nutrient identifiers
The API returns `nutrient.number` (e.g. "301"), `nutrient.id` (e.g. 1087) and `unitName`. **The bulk CSV `food_nutrient.csv` uses the 4-digit `nutrient_id`; the API `number` is `nutrient_nbr` in `nutrient.csv`.** Mixing them is the likeliest bug in this wave. Store both.

Verified on SR Legacy garlic (number / id / unit): energy 208/1008 kcal; protein 203/1003 g; carbohydrate 205/1005 g; fat 204/1004 g; fiber 291/1079 g; total sugars 269/2000 g; sodium 307/1093 mg; cholesterol 601/1253 mg; saturated fat 606/1258 g; calcium 301/1087 mg; iron 303/1089 mg; magnesium 304/1090 mg; potassium 306/1092 mg; zinc 309/1095 mg; vitamin A RAE 320/1106 mcg (IU 318/1104 also present); vitamin D IU 324/1110; vitamin E alpha-tocopherol 323/1109 mg; vitamin K 430/1185 mcg; vitamin B6 415/1175 mg; vitamin B12 418/1178 mcg; vitamin C 401/1162 mg; folate DFE 435/1190 mcg (folate total 417/1177).
Not verified: vitamin D in mcg (number 328, id 1114) and added sugars (539 / 1235).

Gotchas: the mu symbol in units can arrive garbled, so store unit text from our own `nutrients` table, not from the payload. Vitamin A has several representations and the DV is in RAE. **A nutrient missing from an SR Legacy record means "not analysed", not zero** (USDA writes 0 for a true zero).

### Household weights (clove, medium, cup, can)
`foodPortions[]` gives `amount`, `measureUnit.name`, `modifier`, `portionDescription`, `gramWeight`. In SR Legacy the unit lives in `modifier` ("clove", "medium", "cup, chopped"); in Foundation it is often a single "RACC" row. `scripts/nutrition/nutrition.py` already handles this (`volume_density`, `portion_grams`, `PART_WORDS` so "1 onion" never picks half an onion). Canned sizes are **not** in USDA portions; they need a curated US can-size table. Whether the recipe line's stated can size (e.g. "15-ounce") survives in `prep_note` needs checking in lane A.

### Bulk download versus API
- API: free key, 3,600 requests per hour. Our need is about 600 foods at one call each. The committed cache makes runs reproducible. This is what the repo does now and it is enough.
- Bulk: CSV and JSON zips per dataset at fdc.nal.usda.gov/download-datasets (sizes unverified; Branded is gigabytes). Use SR Legacy bulk only as an offline lookup for the curator, never loaded wholesale into Postgres. Storing only the chosen ~600 foods keeps it to about 15,000 rows.

### Licence and attribution
FoodData Central data is CC0 1.0 (public domain); USDA asks for citation, not permission. Add: "Nutrient data: U.S. Department of Agriculture, Agricultural Research Service, FoodData Central (fdc.nal.usda.gov)" to `/about` and the panel footnote. Keep the "estimate, not medical advice" disclaimer. Keep Branded use minimal (manufacturer-supplied).

## 3. Design (not built)

### 3.1 Tables
Reference data is select-only to clients via RLS; writes only by migration or the integrator's seed.

- `nutrients` (id smallint pk, `key` text unique e.g. `vitamin_c_mg`, name, unit, `fdc_number`, `fdc_nutrient_id`, `dv_amount`, `dv_unit`, `display_group`, `sort`). About 25 rows. The `dv_*` columns hold FDA 2016 DVs: calories 2000, total fat 78 g, saturated fat 20 g, cholesterol 300 mg, sodium 2300 mg, carbohydrate 275 g, fiber 28 g, added sugars 50 g, protein 50 g, vitamin D 20 mcg, calcium 1300 mg, iron 18 mg, potassium 4700 mg, magnesium 420 mg, zinc 11 mg, vitamin A 900 mcg RAE, C 90 mg, E 15 mg, K 120 mcg, B6 1.7 mg, B12 2.4 mcg, folate 400 mcg DFE (total sugars has no DV). This table should be the single source for the Me panel, replacing the planned `dv.ts` constants.
- `usda_foods` (fdc_id pk, description, data_type, publication_date, cached_at).
- `usda_food_nutrients` (fdc_id, nutrient_id, amount_per_100g numeric; pk both). **Absent row = not reported; present row with 0 = true zero.** A long table rather than 20 columns: it is not on any filter path, and a new nutrient is a row, not a migration. This revisits SCHEMA-NOTES Decision 4 only for micros; the six hot-path columns on `recipes` stay.
- `ingredient_foods` (ingredient_id, `form` text default 'default', fdc_id; pk both). Makes `rice [cooked]` and `beans [canned]` first-class instead of JSON keys. Backfill the default form from `ingredients.fdc_id`.
- `ingredient_portions` (ingredient_id, unit_id nullable (NULL = "each"), grams_per_unit numeric, source text ('usda' | 'curated' | 'us_can_size'), note). Generalises `unit_g` from the JSON map. Density stays in `ingredients.density_g_per_ml`; materialise the derived value (today computed at run time from portion labels) so SQL needs no label parsing.
- `recipe_nutrients` (recipe_id, nutrient_id, amount_per_serving numeric NULL, coverage numeric 0..1, computed_at; pk recipe_id+nutrient_id) plus on `recipes`: `nutrition_status` ('complete' | 'partial' | 'unavailable'), `nutrition_source` ('usda_myplate' | 'computed'), `nutrition_gaps` text[]. This is a cache, regenerable at any time.

### 3.2 Compute function (catalog and user recipes)
Two layers:
1. `compute_nutrients(lines jsonb, servings int)` returns rows (nutrient_id, amount_per_serving, coverage, gaps). `lines` is `[{ingredient_id, quantity, unit_id, prep_note, is_optional}]`. It never reads `recipes`, so the same call previews a user-recipe form before save. `STABLE`, `SECURITY INVOKER`, over select-only reference tables, so no new RLS surface.
2. `refresh_recipe_nutrients(recipe_id)` calls layer 1 with the stored lines and upserts `recipe_nutrients` and the status columns. Called once at the end of the user-recipe save RPCs and from an admin/seed batch for the catalog. Not a row trigger on `recipe_ingredients` (it would recompute per row). A batch `refresh_all_recipe_nutrients()` runs after any change to `ingredient_foods` or `ingredient_portions`.

Per line: grams = mass (`to_base_factor`) | volume (ml x density) | count (`ingredient_portions`, unit "each" when no unit); no quantity = skipped, not a gap; optional = excluded and listed; then `grams/100 x amount_per_100g` per nutrient; sum; divide by servings. Keep the data-like logic (portions, density, forms) in tables. Heuristics such as frying-bath oil absorption go in a small `prep_rules` table the function reads, so one place defines them.

Per-nutrient coverage = grams of counted lines whose food reports that nutrient / grams of all counted lines. Status: `complete` when every quantified, non-optional line has a food and grams; `partial` when some do not (named in `nutrition_gaps`); `unavailable` below 50% of lines. A nutrient with coverage below about 0.9 shows "at least" or is hidden (owner's call).

### 3.3 MyPlate's published values
- 851 recipes carry USDA's own published six values from USDA's recipe analysis, including cooking yield and exact products. They are the best ground truth available. Recommendation: **keep them as the displayed macros** (`nutrition_source = 'usda_myplate'`), compute micros for the same recipes, store computed macros for validation only, and queue any recipe where computed and published calories differ by more than 20% as a data-quality review item (likely a mapping or unit error or a truncated import).
- Mixing risk: published macros with computed micros are not consistent to the digit. Label the whole panel "estimated from USDA ingredient data".
- User recipes and the 106 originals: computed throughout.

### 3.4 Special cases
- **To taste / no quantity (696 rows):** contribute 0, listed as "not counted", never a gap. Sodium is therefore a minimum for "salt to taste"; say so in the footnote.
- **Optional:** excluded by default (matches `--exclude-optional`) and listed.
- **Unresolved:** cannot exist (imports reject them). The real case is "resolved but no USDA food or no gram weight": goes to `nutrition_gaps`, status partial. Never fill with a guess.
- **Raw versus cooked:** amounts are as listed. Macro and mineral totals are conserved through cooking, so do not scale by cooked yield. Use the cooked or canned food only when the line says so (existing form detection). Heat losses of vitamin C, folate and B vitamins (roughly 10 to 50%) are real: v1 applies no retention factors and labels the panel "before cooking losses"; v2 can apply USDA's Table of Nutrient Retention Factors (see `docs/research/food-science-nutrition.md`, which flags some figures unverified).
- **Cans:** curated US can sizes in `ingredient_portions` (source `us_can_size`), with whole-can versus drained handled by form.
- **Added sugar:** SR Legacy has none; see question 3.
- **Water, ice, cooking spray, salt:** water maps to a zero-nutrient food; cooking spray to a small curated amount.

### 3.5 Read path
The recipe page (ISR) reads `recipe_nutrients` joined to `nutrients` (about 24 small rows) in the existing `recipeDetail` query via `src/lib/queries/`, returning per-serving amount, %DV and coverage. %DV comes from the `nutrients` table, with no DV constants elsewhere (LESSONS: hard-coded duplicates drift). Bump any `unstable_cache` key whose shape changes.

## 4. Validation plan

1. **Macro ground truth.** Compute the six values for every MyPlate recipe that is fully computable and compare with published. Report per nutrient: median absolute % error, p90, share within 10% and 20%. Targets: calories and protein median at most 8%, carbs and fat median at most 10%, 80% of recipes within 15% on calories; sodium and fiber median at most 20% (salt to taste, canned products). M1.5.4 baseline: auto-matching gave 17% calories and 41% sodium. Only 66 fully computable MyPlate recipes can be tested today; rerun after each mapping batch (600+ expected at the end).
2. **Micronutrient ground truth.** None in the database. The MyPlate extractor reads only six JSON-LD fields; the pages also show a Nutrition Facts panel which on the FDA label includes saturated fat, cholesterol, total sugars, vitamin D, calcium, iron, potassium. Re-extract from the Internet Archive capture (the cache is gitignored and absent from this checkout; re-fetch at the existing gentle `JOBS=2`). If present, those give seven more nutrients as truth for about 850 recipes. For vitamins A, C, E, K, B6, B12, folate, magnesium and zinc use hand checks.
3. **Hand-calculation set.** 10 recipes computed by hand from the FDC web pages, covering the owner's example (2 lb ground beef = 907 g, 1 clove garlic = 3 g, soy sauce), a baked good, a soup with canned items, a rice dish with cooked rice, and an egg dish. Tolerance 5% (arithmetic, not estimation).
4. **SQL sanity gates** before any apply: no negatives; kcal within 10% of 4P+4C+9F; per-serving values below plausible maxima; coverage never above 1; second run produces identical rows (md5 compare, as in M1.5.4); a recipe with only "to taste" lines is `unavailable`, not zeros.
5. **User-recipe check.** The same function on a 3-line draft returns the expected rows, and an unmapped line is a gap, not a number.

## 5. Effort and risks

| Piece | Effort |
|---|---|
| Re-fetch FDC for about 600 foods with 24 nutrients, load `usda_*` tables | small (1 session) |
| Curate about 150 more ingredient mappings, forms, can sizes, cooked/canned variants | **largest** (3 to 5 sessions; the human review is the bottleneck) |
| Migrations: about 6 tables, SQL functions, refresh RPC, RLS select-only | medium (2 sessions) |
| Recipe page panel with %DV, catalog and user-recipe wiring | medium (2 sessions) |
| Validation scripts, MyPlate extra-field ground truth, hand set | medium (1 to 2 sessions) |
| Me dashboard panel using `recipe_nutrients` | separate wave (dashboard not built) |

Risks:
- **Mapping quality** is the dominant accuracy risk. Mitigation: only reviewed mappings; "partial" instead of guessing.
- **Missing is not zero.** A naive sum understates unreported nutrients. Mitigation: NULL semantics plus per-nutrient coverage.
- **Foundation records are sparse.** Mitigation: SR Legacy first; a script fails if a chosen food lacks any of the 24 nutrients unless explicitly accepted.
- **Cooked/raw/canned confusion** moves vitamin C, sodium and calories by large factors. Mitigation: form rows, prep-note rules, per-line audit output.
- **Vitamin A and D unit variants** (RAE vs IU, mcg vs IU). Mitigation: one conversion table with tests on known foods.
- **False precision.** Round to 2 significant figures, label "estimated", keep the disclaimer.
- **Performance:** none; 24 small rows per recipe, read from the cache table.
- **Process:** `pnpm db:types` in the same commit as the migrations; the live database is touched only at integration, after a backup; the Supabase project must be `ACTIVE_HEALTHY`.

## 6. Proposed lanes (non-colliding files)

| Lane | Owns | Output |
|---|---|---|
| **A. Data and curation** | `scripts/nutrition/` (extend `fdc.py` to 24 nutrients, new export script), `scripts/nutrition/ingredient-map.json`, generated `supabase/seed-usda-nutrition.sql` | Cached FDC foods with full micros; about 150 more mappings; can sizes; completeness report; review sheet for the owner |
| **B. Schema and compute** | new `supabase/migrations/2026…_nutrients_*.sql`, `scripts/nutrition/sql-checks.sql` | `nutrients` (with DVs), `usda_*`, `ingredient_foods`, `ingredient_portions`, `recipe_nutrients`, `compute_nutrients`, `refresh_recipe_nutrients`; tested against a Docker Postgres from the snapshot; **no live apply** |
| **C. Validation** | `scripts/nutrition/validate_*.py`, `scripts/myplate/extract.py` additions | Report against MyPlate macros and any extra published nutrients; hand set; thresholds above |
| **D. UI and queries** | `src/lib/queries/recipeNutrients.ts`, the recipe page nutrition component, `src/lib/nutrients.ts` (no hard-coded DVs), attribution text in `/about` | Panel with %DV and "estimated"/"at least" labels; graceful when the table is empty |
| Integrator (not a lane) | `docs/*`, `src/types/database.ts`, live DB | Backup, apply migrations in order, `pnpm db:types`, seed, refresh, verify DoD |

Order: A and B in parallel (contract: the table shapes in 3.1, agreed up front); C needs A's data and B's function; D needs only B's shape (fixture rows). The hook that makes `save_my_recipe` call `refresh_recipe_nutrients` is a new migration owned by B, not an edit to the M5 migrations.

Definition of done (observable): for 20 sampled recipes the page shows all 24 nutrients; the owner's beef/garlic/soy example matches a hand calculation within 5%; at least 85% of published recipes are `complete`; the validation report meets the section 4 tolerances; no `recipe_nutrients` row is NULL where the status says complete.

## 7. Open questions for the owner (with recommendations)

1. **Which nutrients in v1?** The 22 listed plus calories, protein, carbs, fat is feasible. Recommendation: all, with added sugar per question 3.
2. **MyPlate recipes: keep USDA's published macros or recompute everything?** Recommendation: keep published macros, add computed micros, validate the two against each other, revisit after the report.
3. **Added sugar** (absent in SR Legacy). (a) omit, (b) take from FNDDS/Branded where mapped, (c) a curated list of added-sugar ingredients (sugar, honey, syrup, jam, sweetened yogurt, juice concentrate) counted as added, natural sugars as not. Recommendation: (c), labelled estimated.
4. **Partial recipes: show or hide?** Recommendation: show macros as "at least" with named uncounted ingredients; show a micro only when its coverage is at least 90%, else "not enough data".
5. **How much curation can you review?** About 150 ingredients need a choice (cooked vs raw, canned drained vs whole). Recommendation: Claude proposes the top 3 candidates per ingredient in a sheet; you approve in batches of 30.
6. **Daily values:** one FDA adult DV, or sex/age DRIs on Me (the mockup suggests male/female views)? Recommendation: FDA DV on recipe pages (matches labels people know), DRIs on Me; the `nutrients` table can gain DRI columns later.
7. **Cooking losses:** ignore in v1 and label "before cooking losses"? Recommendation: yes.
8. **Salt "to taste":** count nothing, or assume a default (e.g. 1/4 tsp per serving)? Recommendation: count nothing and footnote sodium as a minimum.
9. **Can sizes:** adopt standard US sizes (14.5 oz vegetables, 15 oz beans and tomatoes, 10.75 oz soup, 5 oz tuna) when the line states none? Recommendation: yes, flagged in the audit trail.
10. **User recipes:** show the computed panel on the draft preview (compute layer only, no storage) and store it on publish? Recommendation: yes. The M5 flags are still off.
11. **Branded foods** for niche ingredients where micros will be "not reported"? Recommendation: allowed for about 10 ingredients, each listed in the report.
12. **Attribution wording and placement.** Recommendation: as in section 2.

## 8. Facts to re-check before building

- Vitamin D mcg (328/1114) and added sugars (539/1235) identifiers, and which datasets populate them.
- Bulk download sizes and the current SR Legacy release notes (the download page is a JS app and could not be scraped here).
- Whether MyPlate pages carry more nutrients than the six extracted now.
- Whether can sizes survive in `prep_note` or the importer's raw ingredient text.
- Unit-symbol encoding in API payloads on Windows (store our own unit text).
