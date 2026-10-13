# Cookware backfill (wave 5)

Source of truth for which cookware each recipe needs, and the minimal step edits that
name an implied tool.

| File | What it is |
| --- | --- |
| `assignments.tsv` | `recipe_slug <TAB> cookware slugs` for the 856 recipes that had no cookware (`none` = no-cook). Recipes that already had rows (97 originals, 6 mockups) are untouched. |
| `step_edits.tsv` | `recipe_slug <TAB> sort_order <TAB> old text <TAB> new text`. 138 steps in 116 USDA MyPlate recipes. |
| `build.py` | Turns the two TSVs into `supabase/seed-cookware.sql` (`python scripts/cookware/build.py`). |
| `apply.sh` | Runs `supabase/seed-cookware.sql` against `$DATABASE_URL`. The new cookware rows come from migration `20261013100000_cookware_vocabulary.sql`, which must be applied first. |

## Rules used

- **Cookware** = a vessel or appliance you must own. Bowl, knife, colander, spoon: not cookware.
- Explicit mention first (`skillet`, `baking sheet`, `muffin pan`), implied tool second
  (`simmer` -> pot/saucepan, bake a casserole -> baking-dish, roast vegetables -> sheet-pan).
- `small pot` -> `small-saucepan`; `kettle`/`stockpot` -> `pot`; `frying pan`/`sauté pan`/`electric skillet` -> `skillet`;
  `pie plate`/`springform`/`tube pan` -> `cake-pan`; `9x13 pan`/`casserole` -> `baking-dish`; `rimmed baking sheet`/`jelly-roll` -> `sheet-pan`.
- "X or Y" appliances that are a convenience (`fork or mixer`, `masher or food processor`) are not listed;
  "X or Y" that are both real ways to cook the dish (`griddle or skillet`) list both.
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
