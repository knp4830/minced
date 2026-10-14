# Cookware backfill (wave 5)

Source of truth for which cookware each recipe needs, and the minimal step edits that
name an implied tool.

| File | What it is |
| --- | --- |
| `assignments.tsv` | `recipe_slug <TAB> cookware slugs` for the 856 recipes that had no cookware (`none` = no-cook). Recipes that already had rows (97 originals, 6 mockups) are untouched. |
| `step_edits.tsv` | `recipe_slug <TAB> sort_order <TAB> old text <TAB> new text`. 137 steps in 115 USDA MyPlate recipes. |
| `alt_groups.tsv` | `recipe_slug <TAB> cookware slugs` (comma separated): one line per "X or Y" alternatives group, 36 recipes. Needs migration `20261014100000_cookware_alt_groups.sql`. |
| `build.py` | Turns the three TSVs into `supabase/seed-cookware.sql` (`python scripts/cookware/build.py`). |
| `apply.sh` | Runs `supabase/seed-cookware.sql` against `$DATABASE_URL`. The new cookware rows come from migration `20261013100000_cookware_vocabulary.sql`, which must be applied first. |

## Rules used

- **Cookware** = a vessel or appliance you must own. Bowl, knife, colander, spoon: not cookware.
- Explicit mention first (`skillet`, `baking sheet`, `muffin pan`), implied tool second
  (`simmer` -> pot/saucepan, bake a casserole -> baking-dish, roast vegetables -> sheet-pan).
- `small pot` -> `small-saucepan`; `kettle`/`stockpot` -> `pot`; `frying pan`/`sauté pan`/`electric skillet` -> `skillet`;
  `pie plate`/`springform`/`tube pan` -> `cake-pan`; `9x13 pan`/`casserole` -> `baking-dish`; `rimmed baking sheet`/`jelly-roll` -> `sheet-pan`.
- **Alternatives are a group (wave 7).** "X or Y" in a step is listed in `alt_groups.tsv`
  (`recipe_slug <TAB> a,b,c`, one line per group; `build.py` numbers a recipe's groups 1, 2, ... and
  adds any member that is missing). Rows of one recipe sharing an `alt_group` are alternatives: "recipes that use X"
  matches any member, and "only cookware I own" passes when the cook owns ANY member of each group (ungrouped rows are
  still required one by one). Group only when neither tool is required elsewhere in the recipe (browning in a skillet
  then "skillet or roasting pan" later still needs the skillet, so that one is not grouped). A recipe that really uses both at once,
  such as pasta in a pot plus sauce in a saucepan, keeps both ungrouped. Before wave 7 only the more common half was listed.
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
