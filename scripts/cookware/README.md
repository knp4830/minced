# Cookware backfill (wave 5)

Source of truth for which cookware each recipe needs, and the minimal step edits that
name an implied tool.

| File | What it is |
| --- | --- |
| `assignments.tsv` | `recipe_slug <TAB> cookware slugs` for the 856 recipes that had no cookware (`none` = no-cook). Recipes that already had rows (97 originals, 6 mockups) are untouched. |
| `step_edits.tsv` | `recipe_slug <TAB> sort_order <TAB> old text <TAB> new text`. 137 steps in 115 USDA MyPlate recipes. |
| `build.py` | Turns the two TSVs into `supabase/seed-cookware.sql` (`python scripts/cookware/build.py`). |
| `apply.sh` | Runs `supabase/seed-cookware.sql` against `$DATABASE_URL`. The new cookware rows come from migration `20261013100000_cookware_vocabulary.sql`, which must be applied first. |

## Rules used

- **Cookware** = a vessel or appliance you must own. Bowl, knife, colander, spoon: not cookware.
- Explicit mention first (`skillet`, `baking sheet`, `muffin pan`), implied tool second
  (`simmer` -> pot/saucepan, bake a casserole -> baking-dish, roast vegetables -> sheet-pan).
- `small pot` -> `small-saucepan`; `kettle`/`stockpot` -> `pot`; `frying pan`/`sauté pan`/`electric skillet` -> `skillet`;
  `pie plate`/`springform`/`tube pan` -> `cake-pan`; `9x13 pan`/`casserole` -> `baking-dish`; `rimmed baking sheet`/`jelly-roll` -> `sheet-pan`.
- **Alternatives list one tool only.** Rows are ANDed by the owned-cookware filter ("only recipes I can make"), so listing
  both halves of "X or Y" would hide the recipe from someone who owns just one. Keep the more commonly owned tool:
  `blender` over `food-processor`, `skillet` over `griddle`/`wok`, `pot` over `saucepan` (unless an edited step names the other; a recipe that really uses both at once, such as pasta in a pot plus sauce in a saucepan, keeps both).
  A convenience appliance (`fork or mixer`, `masher or food processor`) is not listed at all.
- Anything oven-baked has at least one row (`sheet-pan` for foil packets and stuffed potatoes); only genuinely no-cook recipes are `none`.
- Steps are edited only when the step names no vessel at all (or a bare `pan`) in a cooking context.
  Dimensions alone (`13x9 inch pan`) already name the pan. Quantities, ingredients and cues are never changed.
- Edited recipes go back to unreviewed in the admin queue (the seed file does this).

## Applying

```
bash scripts/cookware/apply.sh      # against $DATABASE_URL; idempotent
```

Step edits are guarded on the old text: re-running is a no-op, and if a step has changed since it was reviewed
the whole file aborts instead of overwriting it.

Recipes in the `Minced original` set are generated from `scripts/content/recipes/*.txt`; their step text is not
edited here (a rebuild would revert it). Their cookware rows were written by hand with the recipes.
