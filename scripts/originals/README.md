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

## Photos (prepared, nothing uploaded)
130 of the 155 recipes have an honest Wikimedia Commons photo (CC0 / CC BY / CC BY-SA, author recorded); 25 stay on the
placeholder because no sharp, licensed photo of that dish alone was found (the dish was only shown with other dishes, in a
restaurant scene, or as packaging): ambul-thiyal, banh-xeo, bun-bo-hue, cabbage-mallung, char-siu, chicken-afritada,
chicken-vindaloo, com-tam-suon-nuong, cong-you-ban-mian, dhokla, goi-ga, gu-lao-rou, kinpira-gobo, nepali-tomato-achar,
panang-curry, pasta-e-fagioli, pierogi-ruskie, pinakbet, pol-sambol, pork-menudo, saba-shioyaki, salt-and-pepper-shrimp,
sayur-lodeh, steamed-fish-ginger-scallion, zha-jiang-mian.
- Every candidate was looked at on a contact sheet next to the recipe's ingredients (`w8_search.py search|sheets`, size floor
  1000 px, sharpness floor); picks are in `scripts/photos/manifest/commons_picks_w12.json`, rows are merged into
  `manifest/commons.json` and `manifest/photos.json` (377 -> 507 rows; `check_manifests.py` reports 0 problems).
- A photo shows the finished dish; a visible brand, menu, logo or a person as the subject was rejected. Recipes are
  `in_review`, so a photo only becomes public when the recipe is approved.
- Processed WebP (md 1200 / sm 640, content-hashed) and the downloaded originals are in the local, untracked folder
  `.snapshot/w12-cuisine-photos/` (`out/commons/<slug>/...` and `cache/commons/images/<slug>.bin`). Integrator: copy `out/` and `cache/`
  into `scripts/photos/`, then `upload_photos.py --apply` (live Storage) and `apply_manifest.py > supabase/seed-photos.sql`.
  Do NOT re-run `process_images.py` from a checkout that lacks the older caches: it drops every row whose cached image is missing.
