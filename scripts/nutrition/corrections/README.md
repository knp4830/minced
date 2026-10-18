# Nutrition data corrections (wave 10 fixer)

Fixes for what the independent audit found in the nutrition data. Seeds are loaded in this order (see `../LIVE-STEPS.md`):

    ... seed-nutrition-world.sql
    seed-nutrition-branded-extra.sql   13 nutrients the loader never stored for branded foods (generated)
    seed-nutrition-zz-integration.sql
    seed-nutrition-zy-replacements.sql replacement foods a correction points at (generated)
    seed-nutrition-zzz-corrections.sql rules + the link actions below (LAST)

| File | What it is |
| --- | --- |
| `link_corrections.tsv` | Source of truth for wrong brand links, wrong defaults and proxies left unmapped. `drop_link`, `set_default`, `unmap`. |
| `audit_wrong_links.csv` | The audit's own list (87 rows) that seeded the TSV. Kept as evidence, not read by any script. |
| `make_link_corrections.py` | Builds the TSV from the audit CSV plus the fixer's additions. |
| `build_corrections.py` | Splices the TSV into the marked block of `supabase/seed-nutrition-zzz-corrections.sql`. |
| `reload_branded_nutrients.py` | FDC API (batches of 20, 1 call per second) to `seed-nutrition-branded-extra.sql`. Never overwrites a stored value. |
| `add_foods.py` | FDC API to `seed-nutrition-zy-replacements.sql` for specific replacement foods. |

Rules in the corrections seed (all idempotent, all deletes mean "not reported", never 0):

* impossible values: cholesterol over 3,500 mg, B12 over 120 mcg, a sub-nutrient above its parent, the 7 synthetic Foundation energy rows;
* branded energy gate (over 25 percent and 15 kcal from 4P+4C+9F beyond the label-rounding allowance, 0 kcal beside real macros), polyol sweeteners and
  alcohol/vinegar foods exempt by name; defaults are held to over 25 percent and 30 kcal with no rounding allowance;
* branded energy capped at 900 kcal; duplicate (ingredient, form, description, owner) rows collapse to the newest;
* wrong household weights, simple-plural and wrong aliases, the razor clam / Jerusalem artichoke plural merges, `drumsticks` to `moringa pods`.

The same gates run at generation time in `scripts/world-ingredients/quality.py` (`plausible`, `sane_nutrients`) so a regenerated seed does not reintroduce them.
