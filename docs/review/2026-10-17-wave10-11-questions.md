# Waves 10 + 11 questions and owner steps (2026-10-17)

Nutrition for every ingredient (wave 10) and the Settings page with default filters (wave 11). Answer by number. Nothing here blocks the merge, but steps 1 to 3 must happen in order.

## OWNER STEPS (in order)

1. Merge order: PR #57 (wave 9) is already merged, so this PR is based on `main`.
2. Say "go". Claude backs up live, applies the ten new migrations, loads the seeds, runs `refresh_all_recipe_nutrients()` with JIT off, and verifies by counting. Exact list: `scripts/nutrition/LIVE-STEPS.md`. Code merged before the migrations gives 500s on `/settings`, signed-in `/recipes`, and the Me panel.
3. Merge, then push an empty commit so the Vercel preview re-runs against the new schema. Revalidate recipe pages (ISR is 1 hour) so labels appear.
4. Review the mapping CSVs (below). Nothing needs to be finished before launch, but wrong defaults change calories.

## Your mapping review (what to open, in what order)

Agents proposed every mapping; two auditors checked samples and fixed what they found. You are the final check.

1. `scripts/nutrition/review/ingredient-mapping-review.csv`: all original ingredients and the USDA food each defaults to. Work in **batches of 30, highest recipe-row impact first** (the file is already sorted that way). Columns give confidence (H/M/E), reason and alternates. Mark a row wrong and say what it should be.
2. `scripts/nutrition/review/curated-weights-review.csv`: every gram weight that did not come from USDA (can sizes, chicken breast 170 g, kosher salt 4.8 g per tsp). Same batches of 30.
3. `scripts/nutrition/review/recipe-line-fixes.csv`: recipe lines the audit corrected (lost qualifiers, "A or B" lines, cooked rice).
4. `scripts/world-ingredients/review/new-ingredients.csv`: 1,371 new world ingredients. Look at the **proxy and loosely related rows first** (match_type column, 261 rows), then batches of 30 by region.
5. `scripts/world-ingredients/review/brand-foods.csv`: brand foods (Kikkoman, Lee Kum Kee, Goya...). Spot-check 30 against the product label.
6. `skipped-ingredients.csv`, `summary-by-region.csv`, `summary-by-category.csv` are for reference.

## Auditors' findings (independent agents, round 2, on the integrated branch)

- **Food data audit.** Nutrient values match USDA exactly (3,391 values re-fetched from the API, all 2,177 branded foods re-checked, 0 unexplained). The failures were mapping, not data: about 14 wrong default foods (blue cheese dressing, doubanjiang, dashi, kombu, veal stock...) and about 40 wrong brand links (flour blends, avocado oil mayo, ramen meals, pecan panko), plus 22 millilitre-sold brand foods with unconverted vitamin D and fat splits. A correction seed (`seed-nutrition-zzz-corrections.sql`) applied these; the lists are in `scripts/nutrition/corrections/README.md`.
- **Recipe calculation audit.** The arithmetic is right: hand calculations match the database within 1 to 5 percent, status logic re-derived for all 957 recipes with no mismatch, drafts through the RPC behave. **Accuracy against the published MyPlate numbers misses the targets**: median calorie error 12.2 percent (target 8), 57.8 percent of recipes within 15 percent (target 80). Causes are import data, not maths: lost qualifiers (low-fat mayonnaise, cooked rice), "A or B" lines counted twice, "halves" imported as whole fruit, cooked/canned with no matching form. A recipe audit seed and migration (`180000`) fixed the systemic ones (no-amount lines are now named gaps, optional lines excluded, cooked/canned/skinless forms). After the fixes the headline is 703 complete, 250 partial, 4 unavailable. The remaining calorie disagreement is flagged, not hidden: recipes more than 20 percent from the published value show a note and appear in the `nutrition_calorie_check` view.
- **UI audit.** Label, type-ahead and Me panel work at 1440 and 375 px with no overflow. Defects found and fixed: computed recipes were labelled "as published by MyPlate"; Me showed micronutrients the recipe page withheld; "soy" put edamame before soy sauce (lead ranking fixed in `190000`); Atwater and IU rows leaked into the Me list; doubled "(no ...)" wording; sat fat above total fat on mixed published/computed labels.
- **Settings audit.** Passed. 68 of 68 RLS checks, cookie replays (forged, malformed, no auth cookie) all ignored safely, defaults apply identically on `/recipes`, search and `/pantry`. Minor: the "Change" link does not scroll to its section on a soft navigation; some chips are 40 px, not 44.
- **Whole-site verifier.** 391 of 400 crawled URLs 200 (rest expected 307/404), all 957 recipe pages render, no overflow, door 2 finds every exact title, cold render about 20 percent slower than before, still small. Found: reference tables kept default write grants (defence in depth only; the migration already revokes all first and grants select, so no action).
- **Security glance (close-out).** No high findings. New tables: RLS on, reference tables select-only. `search_foods` strips input to letters and digits before any `ILIKE`, caps length at 80 and rows at 25. Compute functions are SECURITY INVOKER with a 200-line cap; `refresh_*` are definer and revoked from clients. `set_my_recipe_foods` checks sign-in, the feature switch, ownership and that the food belongs to the line's ingredient. The `minced_prefs` cookie is httpOnly, honoured only alongside a Supabase auth cookie, and vocabulary-checked; a forged one can only change the forger's own filters. Still open from before: no rate limiting on the anonymous RPCs.

## Questions (default built, recommendation)

**Q1. Brands in the same list as ingredients, or a second step?** Built: same list (MyFitnessPal style), ingredients first, then a "Foods and brands" group. Recommend keep.

**Q2. Shredded cheese (17 recipe rows) has no food.** Built: left unmapped, so those lines are a named gap. Recommend map to cheddar with low confidence; say yes and it is one row.

**Q3. "milk" defaults to 2 percent.** Whole, 1 percent and skim are linked as alternates. Recommend keep.

**Q4. 35 original ingredients stay unmapped on purpose** (spice blends whose labels round to zero, taco sauce, breakfast sausage, plantain green vs ripe, fresh tarragon/oregano/sage, nori, pancetta...). 218 world ingredients also have no food. They show as "no nutrition data" and are never guessed. Recommend keep; UK CoFID and Canadian CNF (Open Government Licences) could fill some, but confirm the licence text first.

**Q5. 241 proxy mappings** (choy sum as pak choi, ube as yam, curry leaves as basil...). Recommend approve after the review above; blank any you dislike.

**Q6. Alias re-pointing** for skim, reduced fat and whole milk, whole wheat pasta and bread, ancho chile, tomato puree (they now have their own ingredient because nutrition differs). Recommend keep.

**Q7. Curated gram weights** (chicken breast 170 g, thigh 113 g, can sizes, kosher salt 4.8 g per tsp, halibut fillet 170 g). Recommend keep; they are in the weights CSV.

**Q8. Black beans use a sparse Foundation record** (12 of 35 nutrients, so micronutrients show "not enough data"). Recommend switch to the full SR canned record unless the Foundation sodium matters to you.

**Q9. Published MyPlate macros are kept**, computed micronutrients added, calorie disagreement over 20 percent flagged. Recommend keep. The alternative is to overwrite MyPlate with computed values (worse for accuracy today).

**Q10. A nutrient is shown only when 90 percent of counted mass reports it**, otherwise "not enough data"; partial recipes say "at least". Recommend keep.

**Q11. Added sugars are an estimate** from a list of 10 sweeteners and jams, labelled estimated. Recommend keep.

**Q12. Sodium is a minimum** (salt "to taste" counts 0), footnoted. Recommend keep.

**Q13. Daily Values on Me are the FDA adult values**, not sex/age specific. Recommend add sex/age DRIs in a later wave now that Settings stores sex.

**Q14. Add-food units on Me are fixed** (g, kg, oz, lb, ml, l, cup, tbsp, tsp, each). Count units like clove only work through "each". Recommend keep for now.

**Q15. No draft nutrition preview in the recipe form yet** (still "estimate pending"). Recommend build next wave; `compute_nutrients` already supports it.

**Q16. Database size.** About 61 MB after the refresh (cap 500 MB, budget 250 MB). `usda_food_nutrients` is the largest table. There is room for roughly 80k more foods. Recommend keep as is; add brands on request.

**Q17. Attribution.** `/about` cites USDA FoodData Central (CC0). Recommend keep.

**Q18. `/lab/foods` QA page** is 404 in production unless `SHOW_LAB=1`. Recommend keep hidden.

**Q19. Settings: allergens union with the URL** (a hand-edited link can never drop a saved allergy). Recommend keep.

**Q20. Settings: unchecking a default allergen has no confirmation and the "Contains nuts, which you avoid" recipe note is not built.** Recommend add both later if wanted.

**Q21. "peanuts" vs "nuts"** is one allergen today. Splitting is a data and matcher change. Recommend a later wave.

**Q22. Saved "vegetarian" returns only 39 of 957 recipes** because many vegetarian dishes are untagged (not new, found by the verifier). Recommend a tagging pass before you rely on diet defaults.

**Q23. No first-sign-up prompt for defaults;** Settings is in the avatar menu. Recommend keep.

**Q24. Wave 12 follow-up migration** drops `me_targets.sex` and `units` and the two mirror triggers (Settings is now the single source). Recommend do it one wave after this is live and stable.

## Known gaps (not fixed here)

- Recipes still more than 20 percent from the published calories carry the note rather than a fix.
- Soft-navigation scroll to `/settings#food`, 40 px chips, bidi override in display names, `/settings` and `/me` not in robots.txt (low).
- Six older SQL suites (admin_review, perf_rls_equivalence, security_hardening, user_cookware_rls, user_recipes, me_rls) cannot fully run on a snapshot (no grants, no `private` schema); they fail the same way on the wave 9 base. Re-run them on a real stack.
- No rate limiting, backups lack `auth.users` and Storage, `next` advisories (carried from before).
