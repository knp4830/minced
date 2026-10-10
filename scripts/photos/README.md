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
