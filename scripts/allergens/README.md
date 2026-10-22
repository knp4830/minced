# Allergen and diet tagging (wave 10c)

Source of truth: `review/tag-sources*.txt` (one line per group of ingredients: allergens with a basis, an optional diet
class, a reason). `build.py` validates every name, writes the reviewed table `review/ingredient-allergens.csv` (one
row per ingredient, with reasons) and generates `supabase/seed-allergen-tags.sql`.

```
python scripts/allergens/build.py --untagged   # summary, lost previous tags, names with no tag (scan for misses)
python scripts/allergens/build.py --seed       # also write supabase/seed-allergen-tags.sql
python scripts/allergens/show.py tagged        # compact reading view;  show_used.py = what recipes actually use
```

Policy (P1-P7) is at the top of `review/tag-sources.txt`. Diet derivation lives in the database
(`refresh_recipe_diets`, migration 20261018120000); `review/recipe-diet-exceptions.csv` is the reviewed exception list.

Tests: `supabase/tests/allergens_test.sql` (throwaway database, after the migration and the seed) and
`node --experimental-strip-types scripts/test-allergens.mts`.

Helpers for a private test database: `build-db.sh` (wave 10+11 state, then this lane), `q.sh` (psql wrapper),
`stack.sh` + `load-snapshot.sh` + `make-test-user.sh` (a local Supabase stack for signed-in checks, own ports),
`test-signed-in.mjs`, `compare_diets.py` (old hand tags vs derived), `export-ingredients.sh`.
