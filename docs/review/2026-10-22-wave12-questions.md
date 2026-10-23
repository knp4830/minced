# Wave 12 questions and owner steps (2026-10-22)

Wave 12 (landing pop-up, stand-in audit and brands, allergen override, recipe-form nutrition preview, 155 new Asian and European originals, Me for any day) is on one PR from `w12/integration`. Answer by number. Nothing here blocks applying the migration and seeds.

## OWNER STEPS (in order)

1. Say "go". Claude backs up live, applies the one migration (`20261022140000_me_day_log`; live goes 59 to 60), then the Wave 12 seeds, the jit-off refresh, `ANALYZE`, `VACUUM (FULL, ANALYZE) recipes` and the photo upload and seed, exactly as in the "Wave 12: ORDERED LIVE STEPS" section of `scripts/nutrition/LIVE-STEPS.md`, and verifies by counting. This happens BEFORE the merge; then the preview is re-run.
2. Merge the PR. `NEXT_PUBLIC_ENABLE_ME` stays off on live until you turn it on.
3. Review the files below, then walk `docs/TEST-CHECKLIST.md` section 19.

## Your review files

- **155 new recipes:** `/admin/review` (they are `in_review`, hidden from the public, labelled AI-drafted). Source URLs, two per dish: `docs/content/RECIPE-REVIEW-w12.md`.
- **Cuisine tags:** `docs/content/CUISINE-BACKFILL-w12.csv` (4 recipes tagged out of 729; 725 left untagged on purpose).
- **Stand-in audit:** `scripts/nutrition/review/proxy-audit-w12.csv` (all 326 decisions with the cited trusted figures).
- **Brands:** `scripts/nutrition/review/brands-w12.csv` and `brands-w12-summary.csv`.

## Auditors' numbers (independent agents, fresh restore of the 2026-10-21 snapshot)

- **Foods: passed.** 326 stand-in decisions re-graded: 0 wrong values or sources (about 0.3 percent of decisions debatable: beef stew meat could cite a better SR record). 73 FDC ids re-fetched and 42 CoFID/CNF references re-read from the source files: 0 differences. 150 random brand foods re-fetched: 0 wrong values (two pure fats sit at the 900 kcal cap), 0 wrong ingredients, 3 of 150 are a different preparation of the right ingredient (non-default links). Plausibility over all 1,901 brand links: 0 violations. MyPlate accuracy unchanged: complete recipes median kcal error 6.0 percent, 81.9 percent within 15; recipes counted from 90 percent of mass 8.4 and 67.6.
- **Originals: passed.** 30 random recipes checked against their sources, none fabricated; longest verbatim run against a source is 8 words. Allergen and diet tags re-derived for all 155: no wrong tag. Six hand-checked nutrition totals agree within 1.6 percent (aloo gosht depends on the raw lamb record).
- **Me: passed.** Past-day logging, edit, remove, "I trained", goal verdicts (10 boundary days, all match hand calculation), wizard math, RLS (124 checks, 0 failures; Bob could not read or change Alice's rows).
- **Landing, allergens, whole site: passed.** Pop-up keyboard and focus, 375 to 1920 no overflow, allergen confirm flow, form preview equals `compute_nutrients`.
- **Counts:** published complete 619 / partial 335 / unavailable 3; in review complete 77 / partial 78; 1,112 recipes; 44 cuisines; 1,984 ingredients; 1,526 with a food; 33 declared stand-ins; 12,034 foods.

## Fixed in the close-out commit

- Me time zone: after sign-out and sign-in in the same tab the page showed the UTC day (the refresh guard never cleared). The guard now applies only while the cookie exists.
- `LIVE-STEPS` ordered list was missing the allergen-tag re-run (step 2.0).

## Questions (default built, recommendation)

**Q1. Landing headline.** "Know what to cook tonight." is tonight-only. Default: unchanged. Recommend: "Know what to cook." (or "Know what to cook, whenever you are hungry.").

**Q2. Time filter counts unknown times (carried forward, now prominent).** 652 of 957 published recipes have no stated time, and a time filter keeps them, so the pop-up's "15 to 30 minutes" mostly returns recipes with no time (15 of the first 18 cards). Default: unchanged. Recommend: exclude unknown times when a time filter is set, or label them "time not stated". Your call because it changes result counts on both doors.

**Q3. "Select filters" pop-up.** No live match count (needs a count RPC); calories and protein are presets, not sliders; saved diet and allergen defaults are not shown as pre-selected; Vegan and Vegetarian can both be picked; chips are 40 px on a phone (44 elsewhere). Recommend: add the count RPC and 44 px chips in wave 13.

**Q4. Fridge photo.** The landing photo is a public-domain USDA FSIS refrigerator picture. Recommend: keep until the redesign, then swap for one from the licensed set.

**Q5. Settings and Shopping buttons on the landing page** link to `/settings` and `/shopping`; signed out they hit a sign-in prompt. Recommend: keep.

**Q6. Signed-out `/pantry` and `/fridge` gate** still says Minced does not keep it in your browser and lists assumed staples. Recommend: soften the first line like the landing section.

**Q7. Allergen override scope.** `showAllergens=1` survives chip taps but is not stored; a hand-typed or shared URL with it skips the confirm dialog (by design: the URL is the choice). Whether it should survive a brand-new typed search is unchecked. Recommend: drop it on any new typed query. Also: searching a named recipe that a saved allergen hides shows "No recipes for shakshuka"; recommend an inline "show anyway" button.

**Q8. Allergen dialog weight.** Risky answer paprika outline, safe answer primary and focused. Confirm once the new colours land (wave 13).

**Q9. Recipe-form preview.** Shows "at least 0 g" for a partial nutrient that is zero so far; hits the database once per unique name per pause (fine now, a batch RPC later; rate limiting is still open project-wide; the action is public like `checkIngredientName`, flag-gated and bounded to about 100 lines). Recommend: hide zero "at least" values.

**Q10. Stand-ins (foods lane).**
- Italian seasoning (19 recipes), Dijon mustard (11), scotch bonnet (8) are now unmapped. Recommend: keep strict (a blend with no trusted record stays a named gap).
- Choy sum, tatsoi, romanesco kept as close relatives on taxonomy alone (13 to 25 kcal). Recommend: keep.
- Sichuan pepper oil, argan, nigella, perilla, pumpkin seed oil kept as plain-oil stand-ins; chili oil unmapped. Recommend: keep.
- Arctic char stays unmapped (CNF is wild, retail is farmed). Which fish should the ingredient mean?
- Guinea fowl linked to CNF meat and skin (158 kcal). Recommend: keep.
- Pointed gourd (CoFID 13-277 parwal, 14 kcal) was missed; no recipe uses it. Recommend: relink next wave.
- Beef stew meat cites a brand label (125 kcal) where SR 171206 (128 kcal) is the better source. Recommend: switch.
- Single-label relinks (yakisoba noodle, taleggio, pea shoots, ricotta salata). Recommend: accept.

**Q11. Brands.** Regional chains (Hy-Vee, Raley's, Schnucks, Tops, Hannaford) are included, ranked last (dropping them cuts about 300 foods). Brands are non-default links only. Recommend: keep, and let the Me picker prefer national brands in wave 13.

**Q12. Originals.**
- 78 of 155 originals are partial (shaoxing wine 12 recipes, gochugaru 8, shrimp paste 8, tamarind paste 7, star anise 7, dashi 6, fried shallots 6) because the stand-in audit unmapped them. Recommend: add trusted foods where a trustworthy record exists (star anise, gochugaru); leave dashi until you pick homemade or instant.
- Add an "American" cuisine for the 725 untagged generic MyPlate recipes? Recommend: yes, in wave 13 with the filter redesign.
- The two quesadilla recipes are tagged Mexican; Tex-Mex may fit better.
- 25 recipes have no photo (130 of 155 have one). Recommend: a second search round.
- Small recipe fixes found by the auditor (non-blocking, do before approving): sisig egg quantity should be 4; gyoza step should say about 2 tsp filling per wrapper; six "dark soy sauce" lines resolve to plain soy sauce with no note (add prep note "dark"); samgyetang omits ginseng and bulalo has no marrow line; the sundubu soy reason says "fermented"; dakgalbi source 2 and Sri Lankan chicken curry source 1 are bad links (each has another good source).
- Coq au vin counts full wine calories though simmering removes some alcohol.

**Q13. Me.** Entry edit semantics (recipe = servings, ingredient or brand = typed amount, quick add = portion multiple); a weight mark on calendar cells (wave 9 had kept it off); month tally says "Goal hit 15 of 22 days"; future days are not loggable; no training streak; drop `me_targets.sex`, `units` and the two mirror triggers after this code is live (one-line migration). Recommend: keep all defaults, do the drop next wave.

**Q14. Me small bugs (non-blocking).** An edited entry keeps the old amount in its name ("150 g" after editing to 300 g); the add dialog shows 271 kcal, the diary 405 for 1.5 servings (rounding), the recipe page 270; "Download my data" omits the new amount and per-nutrient snapshot; an oversized amount says "did not save" rather than "too large"; protein 136.0 and 136.1 g both display as 136. Recommend: fix in the small wave.

**Q15. Not measured.** `sql-checks.sql` (slow), suites needing a Supabase stack (admin_review, nutrition_rls, security_hardening, user_recipes and others, same failure on the untouched snapshot), a production build against paused Supabase, a 1440 px browser check on the integrated build (the pane was too narrow; the landing audit did 1440 and 1920). `matcher_quality_test` "search maxTime keeps unknown-time recipes" fails as superuser when in-review recipes exist (RLS bypass), and `seed-nutrition-zzzzz-math-10c.sql` is not idempotent (do not re-run it on live).

## Security glance

No high findings. The one migration adds columns and `me_update_food`, which is SECURITY INVOKER with an explicit `user_id = auth.uid()` filter on top of RLS, a fixed search_path, execute revoked from public and anon, amount and scale-factor bounds, and returns 0 rows for someone else's entry (checked through PostgREST by the auditor). `previewRecipeNutrition` writes nothing, is flag-gated, shape-checked and bounded. `showAllergens` is parsed as the literal `1`. No raw hex, no new packages, no service-role use. Open and carried forward: no rate limiting, Supabase `auth.users` and Storage are not in backups.
