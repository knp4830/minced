# Wave 14: open questions and review files (2026-10-23)

Each question has a default (what ships if you say nothing) and a recommendation.

## Things only you can do

1. **Say "go"** so Claude backs up live and runs the Wave 14 section of `scripts/nutrition/LIVE-STEPS.md` BEFORE the PR is merged. Then an empty commit re-runs the preview.
2. **Paste the four auth email templates and subjects** into Supabase (steps in `docs/setup/EMAIL-SMTP.md` section 6; files in `supabase/templates/`).
3. **Review the 26 new recipes in `/admin/review`** (20 NHS, 6 MyPlate rescues). Sheet with full text, rewrites, computed vs published numbers, allergens and diets: `docs/content/RECIPE-REVIEW-w14.md`. Lists of everything left out: `docs/content/NHS-NOT-IMPORTED-w14.csv`, `docs/content/MYPLATE-NOT-IMPORTED-w14.csv`.
4. **Foods review:** `scripts/nutrition/review/foods-w14.csv` (every decision with source, values and reason; 22 linked, 17 label defaults upgraded, 436 named gaps) and `panel-coverage-w14.csv` (vitamin and mineral coverage before and after).
5. **Research to read:** `docs/research/prep-effects-nutrition.md` (how cooking, chopping and blending change nutrients; a proposal only, nothing is built).
6. Docker leftovers from the Me lane: container `w14me-snap` and the Supabase stack project `w14-me` may still be running. Remove them when Docker responds (the integration pass reported Docker healthy, so check `docker ps`).

## Blocking before any NHS recipe is approved

**Q1. Licence for the NHS Healthier Families recipes (verifier said NOT demonstrated).** The recipe pages say only "Crown copyright". The Healthier Families terms (nhs.uk/healthier-families/terms-and-conditions/, DHSC, 17 March 2025) reserve all rights, bar commercial use without a licence, and never mention the Open Government Licence. The site-wide NHS terms grant the OGL "except where specified elsewhere", and clause 3.6(b) forbids crediting the NHS, which conflicts with the site's own terms. **Default:** the 20 stay `in_review` and nothing is published. **Recommendation:** email betterhealth-families@dhsc.gov.uk for written permission (or have the lawyer rule) before approving any; if refused, delete the 20 (they are one seed file). The recipe page now links the original recipe only; add an OGL link if permission rests on the OGL.
Related: should `source_name` be neutral ("UK public sector information, OGL v3.0") instead of naming Better Health? Default: unchanged.

## Product decisions

2. **Time filter hides untimed recipes** (about 652 of 957 have no time). Should "Over 60" do the same (it does today), and should the UI say "recipes with no stated time are hidden"? Default: yes it does, no note. Recommendation: add the note, and make the importer store NULL instead of 0.
3. **Today on Me reads "So far" instead of "partly" with red marks until the day is over.** Past days unchanged. Default: keep. Easy to revert (drop `{ open }` in `me/page.tsx` and `dayCard.tsx`).
4. **Me beta risks (recommend fixing before inviting people):**
   - Preview builds with `NEXT_PUBLIC_ENABLE_ME` on need migration `20261022140000_me_day_log` on whatever database they use (confirm which). Order: apply `20261022140000`, merge, then apply `20261023110000`.
   - A first-time visitor can see tomorrow's date for about a second (cookie not set yet). Recommend setting the `me_tz` cookie from the site header.
   - 55 published recipes cannot be logged (no calories); 335 partial ones log a lower-bound number with no "at least" mark. Recommend an "at least" badge and a prefilled Quick add.
   - Me is not in the phone header. Recommend a first position in the account button.
   - The targets wizard preselects "Moderately active" (x1.55), which can overshoot 10 to 20 percent. Recommend no default, or "Lightly active".
   - Brand foods default to 100 g even when the label serving is 1 Tbsp. Recommend defaulting to the label serving.
   - Clearing `sex` in Settings after setting targets hides targets with a "waiting" note. Alternative: block clearing while targets exist.
5. **Foods:** (a) 23 branded riboflavin/niacin/copper/B6 values show in FDC search but not its food record (default: keep). (b) mizithra linked to a real label at 286 kcal (default: keep). (c) sucralose linked to the "Splenda packets" record at 336 kcal per 100 g (default: keep; recommend gap). (d) Raw-weight caveat for FNDDS-linked meats (default: none). (e) 15 label defaults round to zero energy, e.g. sambal oelek (default: honest gaps). (f) Second verifier found ostrich, partridge and lamb fat have a trusted record but are still gaps (no recipe uses them): link them next foods pass. (g) A lane to research sourced estimates for the 66 gaps recipes use (Italian seasoning 19, shaoxing 14, tamarind 13, dashi 12, Dijon 11, gochugaru 11).
6. **Recipes:** (a) "mixed herbs" aliased to Italian seasoning, 5 of 20 NHS recipes; add a real ingredient? Default: leave. (b) Low-sodium stock and soy become the normal food with a note, so those recipes are partial; add low-sodium foods? (c) Approve which NHS recipes first; 12 more pass every gate and are in reserve. (d) 145 non-federal-credited MyPlate pages: leave out permanently (recommended). (e) The 851 live MyPlate recipes predate the authorship rule; run the Source-field audit (LEGAL-COMPLIANCE 1.3) over them. (f) NHS units are grams and ml: convert for a US audience? Default: keep.
7. **Research (cooking effects):** 10 owner decisions are in the doc (O1 to O10). Fact-check found two things to fix before copy ships: scope the resistant-starch note to rice, and use the FDA wording for kidney beans (boil at least 30 minutes), not "ten minutes". Default: nothing built.

## Auditor numbers

- **Counts after the Wave 14 steps (restore of the 2026-10-22 snapshot):** 1,138 recipes. Published 625 complete / 329 partial / 3 unavailable (957). In review 91 complete / 90 partial (181). Ingredients 1,984 (1,548 with a food, was 1,526). Foods 12,060. Stand-ins 33.
- **MyPlate accuracy:** 575 complete recipes, median calorie error 5.9 percent, 82.3 percent within 15; counted from 90 percent or more of mass: 854 recipes, median 8.3, 68.1 percent within 15. No regression. Label coherence: 957 labels, 0 problems.
- **Foods verifier (passed):** 150 decisions re-derived from the publishers: 40 of 40 links correct, 0 wrong micronutrient values out of 40, 17 upgrades satisfy the 12 percent rule. Gap completeness: 3 clear misses in 436 gaps (0.7 percent), all harmless.
- **Recipes verifier (NOT passed):** content fidelity, ingredient resolution, allergens and diets all right for the 26; failed only on the NHS licence (Q1). Minor: 2 recipes store "dried mixed herbs" as Italian seasoning without a note; perfect-pasta-and-tomato-sauce loses "400g chopped".
- **UI verifier (passed):** Me end to end at 1440 and 375, goal-day maths checked by hand, RLS (another user sees nothing), time filter excludes untimed everywhere, warm gate copy, email variables intact, `/lab/hero` is 404. Small findings: the Add dialog previews a recipe at 369 kcal while the diary stores 370 (round the preview the same way); `supabase/config.toml` email subjects differ from the doc; `me_rls_test` cascade check counts all rows so it only passes on a clean database (129 checks seen, 131 reported by the lane); the header may prefetch `/login` for a signed-in user (check on Vercel); the past-day weight card is titled "Log today's weight".
- **Research fact-check (passed with two fixes):** 22 claims checked; USDA retention table and licence (CC0) confirmed.
- **Security glance:** no high findings (see the PR body).
