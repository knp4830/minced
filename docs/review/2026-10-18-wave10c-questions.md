# Wave 10c questions and owner steps (2026-10-19)

Wave 10c (nutrition accuracy, allergens, diets, fridge, Me DRIs) is on PR #58 together with waves 10 and 11. Answer by number. Nothing here blocks applying the migrations.

## OWNER STEPS (in order)

1. Say "go". Claude backs up live and applies the 22 migrations (`20261017120000` to `20261019130000`; live goes 37 to 59), the seeds, `ANALYZE`, a jit-off `refresh_all_recipe_nutrients()` and `VACUUM (FULL, ANALYZE) recipes`, exactly as in `scripts/nutrition/LIVE-STEPS.md`, and verifies by counting.
2. Merge PR #58, then Claude pushes an empty commit so the Vercel preview re-runs against the new schema. Revalidate recipe pages (ISR 1 h).
3. Walk `docs/TEST-CHECKLIST.md` section 18 (desktop first, then the phone items).

## Final audit numbers (independent agents, round 2, on `w10c/integration` b8bb115)

- **Food data audit: not passed (two items).** Counts match: 1,983 ingredients, 10,092 foods, 3,514 links, 1,738 ingredients with a food. 150 sampled foods re-fetched from the FDC API: 0 differences in SR/Foundation values. All 1,822 branded foods re-checked (23,817 values): differences are only documented unit conversions and 7 oils capped at 900 kcal. UK CoFID (23 foods, 562 values) and Canadian CNF (18 foods, 535 values): 0 mismatches against the source files; both licences confirmed on the publishers' pages. Plausibility gate: 0 impossible values. Wrong-rate under 2 percent in every category (default foods 0.8 percent, brand links about 0.3 percent). Failures: black beans do not follow the owner decision; CoFID/CNF import unfinished.
- **Recipe math audit: not passed.** On the 578 complete MyPlate recipes: calorie median error 6.2 percent (target 8), 81.3 percent within 15 percent (target 80), protein 6.5, carbs 7.3, fat 7.3, sodium 10.8, fiber 10.6, all within targets. 11 of 12 hand calculations within 5 percent. On the 848 recipes counted from 90 percent or more of their mass: median 8.7 percent, 66.9 percent within 15 percent, so the targets are met only on the complete population. Status logic re-derived for all 957 recipes with 0 mismatches. 71 recipes more than 20 percent off the published calories are flagged by a label note.
- **Allergens and diets audit: passed.** 200 random ingredients graded, no wrong tag; recipe allergen derivation recomputed independently for all 957 recipes with 0 mismatches; compound items (pesto, satay, Worcestershire, hoisin, oyster sauce, XO) tagged correctly; vegetarian 630, vegan 238, pescatarian-or-better 687, gluten-free 559; signed-in "which you avoid" and optional-garnish behaviour verified in a browser.
- **UI and whole-site audit: not passed.** Landing, grouped fridge (checked by hand on 7 recipes), add-to-list, Me DRIs (288 rows checked against NIH ODS / National Academies), sedentary baseline and robots all passed; all 957 recipe pages render, no overflow at 375 or 1440. Failures were small and are fixed in the close-out commit (see below) except the items under Q3.

## Fixed in the close-out commit

Doubled "(no nutrition data)" wording on nested-bracket gaps (57 recipes), JSON-LD calories rounded like the label, `/privacy` birth-year copy, and three stale tests (`nutrition_compute_test.sql` T2, `synonyms_test.sql`, `test-filters-defaults.mts`).

## Questions (default built, recommendation)

**Q1. Black beans.** You chose canned, full-panel SR record. The data still defaults to SR 175237 (boiled, 132 kcal/100 g). Correct: default and `canned` form = SR 175188 (91 kcal, 35 nutrients), keep 173735 for "cooked from dry" and 175238 for low sodium. Recommend: do it in wave 10d; it is a mapping row plus a seed rebuild.

**Q2. Unfinished CoFID/CNF import.** Only 41 foods were imported; 245 ingredients still have no food (about 50 have candidate rows: kombu, wakame, dulse, fresh oregano / sage / tarragon, plantain, hard cider, hollandaise, lamb fat, ostrich, sucralose). Until then they show as an honest gap. Recommend: finish in wave 10d. The licence text is in `scripts/nutrition/national/LICENCES.md`.

**Q3. Open recipe-math defects, each a gap-or-wrong-number.**
- Curated russet potato / potato each = 230 g versus USDA medium 213 g (about +7 percent on 45 recipes). Recommend 213 g.
- "uncooked" beside "cooked" is read as cooked (3 pasta recipes, 31 to 43 percent low). Recommend: "uncooked" or "dry" with an oz/lb weight wins, or becomes a gap.
- "1 cauliflower, cut in large florets" counts one 25 g floret (Aloo Gobi 19 percent low). Recommend a whole-head weight.
- "Drained and rinsed" canned lines use the full can weight on a solids-and-liquids record (18 black-bean lines, about 10 percent high).
- Mac and Beans Medley: "1 can, black/kidney/pinto" resolved to beef broth; fix at import.
- Roasted cashews use the raw record (about 4 percent).
- Tuscan Potato Skillet, Basic Quiche, Corn Tortillas stay 60 to 80 percent off because the source text lost a size; flagged, not excused.

**Q4. Five wrong gluten-free pasta brand links** (wheat durum pastas linked to "gluten-free pasta"), one stray beer link on `cider`, dried mango powder pointing at sweetened dried mango, and brand densities for almond milk (1.107 should be about 1.03) and crema Mexicana. Recommend: drop the five links and the beer link, unlink mango powder, fix densities.

**Q5. Ramen noodles default to fresh pasta; "Italian cheese blend" resolves to Italian seasoning; pinto beans default to raw dry** (about 3 times the calories when a recipe says "cooked"). Recommend: dry-noodle record for ramen, a cheese for the blends, canned for pinto beans like the others.

**Q6. Garnish rule.** Nine lines were marked optional garnish from step text (walnuts in Banana Walnut Oatmeal, pine nuts, almonds, an egg garnish on gazpacho). They stay visible under a "no tree nuts" or "no egg" filter with a leave-them-out note. Your pad thai example made this the rule; confirm it applies to these nine. Recommend: keep, but move walnuts-in-the-title out of the garnish list.

**Q7. Tags to confirm.** `slow-cooker-beans` is vegetarian with "may contain fish" from barbecue sauce; `manicotti` is tagged dairy; oat flour / bran / rolled oats are "gluten varies" though the policy header says oats are untagged; alternatives like "taco shells (or flour tortillas)" lose the wheat of the second option. Recommend: remove dairy from manicotti, leave the rest as documented.

**Q8. Type-ahead "soy".** Soy sauce is first, then five other soy ingredients, then four brands. Recommend: keep.

**Q9. Not measured.** Cold render time against the base (no base build), local photos (no Storage), and some SQL suites needing grants the snapshot lacks (`admin_review_test`, `me_rls_test`, `shopping_list_test`, `user_recipes_test`); they pass on a plain restore or live-like stack per LESSONS section 10, but that was not re-confirmed this round.

## Security glance (close-out)

No high findings. New tables (`recipe_optional_allergens`, `recipe_diet_exceptions`, `ingredient_assumptions`, `nutrient_dris`) have RLS on and are select-only for anon and authenticated. `fridge_recipes_grouped` and `add_missing_to_shopping_list` are SECURITY INVOKER (RLS is the gate); `add_missing_to_shopping_list` is signed-in only, capped at 60 ids, and the server action validates slug and ids. `refresh_recipe_nutrients` is SECURITY DEFINER with a fixed search_path and execute revoked from public, anon and authenticated. `my_recipe_foods` checks `auth.uid()`, the feature switch and ownership. `/api/me/allergens` is `no-store` and returns an empty list signed out. The national-data loaders run offline from the publishers' files and write only seed SQL. Birth year is owner-only under existing RLS and is included in "Download my data".
