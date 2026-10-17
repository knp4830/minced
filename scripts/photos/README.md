# Recipe photos pipeline

Free, licensed photos for recipes; a colour-block placeholder (see
`design/Minced.dc.html`) for everything else. Never an image of a different dish.

```
USDA MyPlate (archived pages)         Wikimedia Commons
  myplate_fetch.py --stage pages        commons.py search recipes.json
  myplate_audit.py audit                (look at contact_sheet.py output, write picks.json)
  myplate_fetch.py --stage images       commons.py build picks.json recipes.json
     --  (only the included slugs)
  myplate_audit.py build  ──► manifest/myplate.json     manifest/commons.json ◄──┘
                                   │
                        process_images.py   (resize -> out/, writes manifest/photos.json)
                                   │
        upload_photos.py (--apply, LIVE, after merge) ──► Storage bucket `recipe-photos`
        apply_manifest.py > supabase/seed-photos.sql  ──► table `recipe_photos`
```

Committed: `manifest/*.json` (licence evidence per photo), scripts, migration.
Not committed: `cache/` (downloads) and `out/` (resized WebP).

## Rules baked into the code
- Commons licence allowlist: Public domain, CC0, CC BY, CC BY-SA. Anything else is refused (`commons.py selftest`).
- MyPlate: only recipes whose page `Source:` is a federal body, with no stock/photographer credit. See `myplate_audit.py` docstring.
- Archive.org is rate-limited; the fetcher is single-threaded with a delay and backs off on refusals.
- Object paths carry a content hash, so upload is idempotent and cacheable forever.

## Operational notes (measured, wave 2)
- **archive.org rate-limits by network, not by client.** It answered 429 (`X-RL: 0`, `X-NID` = the ISP) for 30+ minutes to a
  single polite worker, and every extra probe restarts the clock. `common.http_get` now sleeps 30 s, 60 s, 120 s ... on a 429
  instead of retrying fast. Run `myplate_fetch.py --jobs 1 --delay 2.5` and leave it alone; it resumes where it stopped.
- `commons.py search ... --out cand_<n>.json` lets several slices of a recipe list be searched side by side
  (Commons itself is fast: 100 recipes took about 10 minutes in 3 slices); `contact_sheet.py` merges every `cand*.json`.
- `commons.py build` refuses a pick whose Commons metadata has no author. Pick another file; do not invent a credit.
- The 6 mockup originals and the 100 `Minced original` recipes are the Commons set. `cache/originals.psv` is
  `psql -At -F'|' -c "select slug,title from recipes where source_name='Minced original'"`.

## Adding photos for new recipes
1. Put `{slug, title, queries?}` rows in a JSON file; `python scripts/photos/commons.py search that.json`.
2. `python scripts/photos/contact_sheet.py`, open `cache/commons/review/<slug>_sheet.png`, pick only images that really show the dish.
3. Add picks to `manifest/commons_picks.json`, run `commons.py build`, `process_images.py`, upload, regenerate `seed-photos.sql`.

## Tests
`python scripts/photos/commons.py selftest` and `python scripts/photos/test_upload.py` (local mock of the Storage API).

## Wave 2 state (finalised)
- 99 photos: 1 federal MyPlate (apple-cranberry-salad-toss) + 98 Commons. 66 further recipes pass the federal-source audit but
  their images were never downloaded (archive.org 429); they stay on the placeholder. To finish later, from a network archive.org
  accepts: `myplate_fetch.py cache/myplate/include.txt --stage images --jobs 1 --delay 2.5`, then `myplate_audit.py build`,
  `process_images.py`, `upload_photos.py --apply`, `apply_manifest.py > supabase/seed-photos.sql`.
- `manifest/myplate_review_excludes.json`: photos excluded after a human look (survives re-running `audit`).
- Post-merge order: apply migration 20261009140000 -> `upload_photos.py --apply` -> run seed-photos.sql.

## Wave 4 (legal replacements, coverage, credit cleanup)
- `commons_w4.py search|sheets|build`: like `commons_r2.py` but with per-recipe custom queries, a looser name+description gate,
  and venue/brand/person words dropped before download. Picks: `manifest/commons_picks_w4.json`.
- `remove_photo.py <slug> "reason"`: the ONLY correct way to drop a photo. `process_images.py` rebuilds `photos.json` from
  `myplate.json` + `commons.json`, so editing `photos.json` alone is undone on the next run. It also records why in
  `commons_r2_rejected.json` (bucket `wave4_review_2026_10_12`).
- `credits.py`: cleans `credit` (<= 40 chars, "Author" or "Author / Flickr", no Commons boilerplate). `--check` fails if any
  credit is long or junk; `commons_r2.py build` calls it for new rows.
- `apply_manifest.py` now also DELETES `recipe_photos` rows whose recipe is not in the manifest, so a removed photo leaves the
  live site when `seed-photos.sql` runs. Review rule of thumb: reject visible brand/venue/receipt text, product shots, people as the
  subject, agency logos (MyPlate.gov), and the same file used for two recipes.

## Wave 3 (round 2: USDA dishes on Commons)
- `commons_r2.py search|sheets|build`: searches Commons for every recipe still without a photo, keeps only files whose
  *name* overlaps the dish name, builds numbered review sheets (`cache/commons/sheets2/`) for a human look, and `build`
  MERGES into `manifest/commons.json` (the older `commons.py build` replaces it). `credit` is shortened for the on-photo
  label; the full `author` stays in the manifest.
- Picks live in `manifest/commons_picks_r2.json`; rejected-but-close candidates are listed in `manifest/commons_r2_rejected.json`
  with the reason, so the next person does not re-review them.
- Photo-less recipes show a designed tile (`RecipePlaceholder`), and recipes with a photo sort first on ties
  (`recipes.has_photo`, migration 20261011110000). Uploading photos and running `seed-photos.sql` flips the flag by trigger.

## Wave 5 (more USDA photos, Openverse, Pexels)
Sources, in order, one photo per recipe (a recipe that already has a reviewed photo keeps it):
1. **USDA MyPlate** (`myplate_*.py`). Owner decision: USDA's own photos are fine, **including ones showing the MyPlate/USDA logo**.
   Still excluded: recipes whose page `Source:` is a university, foundation, network or company, and any stock/photographer credit.
   Review step added in wave 5: `myplate_sheets.py` shows each photo next to the recipe's ingredients; photos that look like stock
   photography (rustic props, cut-out on white) or do not show the finished dish go through `remove_photo.py`, which records them in
   `myplate_review_excludes.json` (the audit then keeps them out for good). `myplate_pending.py cached|missing|need-image` lists slugs so a
   killed fetch resumes without guessing; feed `cached` back through `myplate_fetch.py --stage pages` to rebuild `found.json`.
2. **Openverse** (`openverse.py`, api.openverse.org). Only CC0 / PDM / CC BY / CC BY-SA, creator + licence + landing page recorded in
   `manifest/openverse.json`. **Anonymous budget is 20 requests/min and 200/day** (about 190 recipes per day); one request per recipe,
   every query logged in `cache/openverse/queried.json` so the next day continues. About a quarter of queries produce a candidate and
   about one in twenty a photo that really shows the dish: generic USDA titles ("Baked Fish") rarely have an honestly labelled Flickr photo.
   `--creator USDAgov` restricts a search to the USDA Flickr stream (public-domain federal works, the strongest rights).
   Flow: `ov_slice.py` (order recipes) -> `openverse.py search` -> `openverse.py sheets` -> look -> `ov_pick.py <tiles>` ->
   `openverse.py build manifest/openverse_picks.json`. `ov_pick.py 15=other-slug` re-targets a photo to a recipe it fits better.
3. **Pexels** (`pexels.py`): needs `PEXELS_API_KEY` in `.env.local` (free key: https://www.pexels.com/api/). Without it the command
   exits and does nothing. Rows go to `manifest/pexels.json` with licence `Pexels License`; credit reads "<name> / Pexels".
   Not exercised against the live API in wave 5.

Migration `20261013110000_photo_sources.sql` widens `recipe_photos.source` (+ `openverse`, `pexels`) and `license` (+ `Pexels License`).
Apply it BEFORE `seed-photos.sql`, or the seed fails on the check constraint.
`export_photoless.py <container>` lists recipes still without a photo (with ingredients) from a restored snapshot.

### Wave 5 final state
- 352 photos: 56 new USDA MyPlate (own photos; MyPlate logos allowed, third-party credits excluded), 285 Wikimedia Commons, 10 Openverse, 0 Pexels
  (no PEXELS_API_KEY). 607 of 959 recipes stay on placeholders.
- archive.org refused (429) the last 49 MyPlate images and 1 page (`myplate_pending.py need-image`); resume later with
  `myplate_fetch.py cache/need_image.txt --stage images --jobs 1 --delay 2.5`, then `myplate_audit.py audit && build`, `myplate_sheets.py`.
- Openverse used 185 of its 200 daily anonymous requests; continue tomorrow with `openverse.py search` (queried.json remembers).
- `apply_manifest.py`'s seed raises if a manifest slug has no recipe: drop such slugs with `remove_photo.py` (done for baked-fish,
  sweet-potato-casserole-0, removed in the duplicate merge).

## Wave 7 (re-audit, more Openverse/Commons/USDA-on-Commons)
Owner rule: every photo must match the recipe's description AND look (same dish, cooked the same way, the recipe's main visible
ingredients). Different dish or style, raw ingredient, logos, people, stock-photography look, doubtful uploader rights: reject.
- `export_details.py <container>` writes `cache/details.json` (description, ingredients, steps for all recipes). `review_sheets.py`
  builds sheets that put each photo next to that text (`audit`/`agrid` for photos already in the manifests, `cand`/`grid` for
  candidates; `DENSE=1` for 4x3 tiles). Look at every tile; reject on doubt.
- `commons_usda.py list|match`: USDA's own photos on Commons (Team Nutrition child care series etc.), matched by dish name.
- `openverse.py search --tag "#2"` re-queries a recipe with a different query (the key in `queried.json` gets the suffix) so
  hand-written queries are possible after the bare-title query returned nothing. One request per recipe still.
- All 50 photos that an earlier wave-7 attempt added were re-reviewed; 28 failed and were removed with `remove_photo.py`
  (bucket `wave7_review_2026_10_14` in `commons_r2_rejected.json`; MyPlate ones in `myplate_review_excludes.json`).
  `commons_picks_w7.json` is NOT cleaned by `remove_photo.py`: drop the slug there too, or `commons_w4.py build` re-adds it.
- Re-running `process_images.py` after the removals leaves no rejected slug in `photos.json` (checked).

## Wave 8 (quality audit, sharper rendering, curated landing photos)
**Why the hero looked blurry (measured):** `getLandingPhotos` served the 400 px `sm` file into a 379 px tile (426 px at 2560 wide), so a 2x
screen stretched it 2x; `process_images.py` capped `md` at 800 px, too small for a 590 px recipe-page photo at 2x. The source (Agedashi Tofu,
1280 px, Laplacian variance 572) was not soft. Fixes: sizes are now `md` 1200 / `sm` 640 (q82); landing slots 0 and 6-8 read `md`, the other
six read `sm`; the nine landing photos are curated (`CURATED_SLUGS` in `landing.ts`, rationale in `manifest/landing_curated.json`), sources
1920 px. `landing_check.py` prints per slot the file served, the tile size (measured in the browser at 1920/2560) and OK/SOFT at 2x.
- `quality_audit.py measure|csv|sheets` -> `manifest/quality-audit.csv`. Numbers only choose what to look at; every photo was also rated 1-5 by eye on
  contact sheets (`import_scores.py` -> `manifest/quality_decisions.json`), then everything rated 1-2 got a second look at full size
  (`w8_second_look.py`). Smooth soups and deliberate shallow depth of field score low on the number and are fine to the eye.
- `orig_sizes.py`, `hires.py fetch|apply` (re-fetch a 1920 px rendition for a photo already in the manifest; Commons rows held the 1280 px thumbnail).
- `w8_search.py search|sheets|build`: commons_w4 plus a size floor (1000 px) and a sharpness floor (Laplacian >= 90 at 480 px) applied BEFORE the
  reviewer sees a candidate; `openverse.py` honours `OV_MIN_LONG` / `OV_SHARP`. Also `w8_lists.py`, `w8_pick_photoless.py`, `w8_make_picks.py`,
  `w8_bulk_remove.py` (bucket `wave8_quality_2026_10_16`), `w8_lowlist.py`, `w8_owner_sheets.py`, `w8_prove_rejection.py` (re-injects every removed row;
  PASS = all dropped, photos.json unchanged).
- Matching standard unchanged: the photo must show the recipe's ingredients, not only its name. Generic USDA titles produced no honest match.

## Review 2026-10-15 (duplicates, USDA restore, more photos)
- Five photos were shared by two recipes (see `NEAR-DUPLICATES.md`): each pair compared by hand. Same dish -> the weaker RECIPE is deleted
  by `scripts/dedupe-near-duplicates.sql` (dry-run mode, idempotent, re-points favourites and shopping links); different dish -> the photo
  stays on one recipe only. `check_manifests.py [--recipes cache/details.json]` fails on any shared file, any returned rejected photo, or a
  photo for a recipe that does not exist; run it before every `process_images.py` -> `apply_manifest.py`.
- The five USDA "MyPlate gov Cultural Food" photos (logo allowed by owner decision) are in the manifest and were re-reviewed against their recipes.
- New helpers: `near_dupes.py` (title stem + ingredient overlap), `photoless_from_manifest.py` (photo-less recipes from the manifest, not a lagging
  snapshot), `rec.py <slug>...` (recipe text), `pick_w4.py <tiles> --through=N` (tile numbers -> picks, remembers reviewed slugs in
  `cache/commons/reviewed_slugs.txt`), `commons_w4.py search` is now resumable and skips files already rejected or used, `commons_w4.py sheets --glob`.
- `openverse.py` no longer dies on a stalled API response (retries); the daily budget of 200 requests was used up (`--tag "#r15"`).
- Post-merge order: backup, dedupe script (dry run, then real), `upload_photos.py --apply`, `seed-photos.sql` (the seed raises on a slug with no recipe, so the dedupe must come first).
