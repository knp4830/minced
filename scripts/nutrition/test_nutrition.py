"""Offline tests for the grams conversion and matching rules. No DB, no network.

    python scripts/nutrition/test_nutrition.py
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nutrition as n  # noqa: E402

FACTORS = {"tsp": 4.92892, "tbsp": 14.7868, "cup": 236.588, "fl oz": 29.5735}


def portion(modifier, grams, amount=1.0):
    return {"amount": amount, "unit": "", "modifier": modifier, "description": "", "grams": grams}


FLOUR = {"portions": [portion("cup", 125), portion("tbsp", 7.8)], "per100g": {"kcal": 364}}
GARLIC = {"portions": [portion("clove", 3), portion("cloves", 9, 3.0), portion("tsp", 2.8)], "per100g": {"kcal": 149}}
ONION = {"portions": [portion("medium (2-1/2\" dia)", 110), portion("large", 150), portion("cup, chopped", 160)], "per100g": {"kcal": 40}}


def line(q, unit, kind, factor=None):
    return {"quantity": q, "unit": unit, "kind": kind, "factor": factor}


class Grams(unittest.TestCase):
    def test_mass_uses_unit_factor(self):
        g, _ = n.to_grams(line(8, "oz", "mass", 28.3495), n.Profile("x", {}, FLOUR, False, None), FACTORS)
        self.assertAlmostEqual(g, 226.796, places=2)

    def test_volume_density_is_median_of_usda_portions(self):
        # 125 g/cup = .528 g/ml ; 7.8 g/tbsp = .527 g/ml
        g, how = n.to_grams(line(1, "cup", "volume", 236.588), n.Profile("x", {}, FLOUR, False, None), FACTORS)
        self.assertAlmostEqual(g, 125, delta=1)
        self.assertIn("USDA portions", how)

    def test_curated_density_beats_usda(self):
        g, how = n.to_grams(line(1, "tbsp", "volume", 14.7868), n.Profile("x", {"density_g_per_ml": 1.2}, FLOUR, False, None), FACTORS)
        self.assertAlmostEqual(g, 17.74, places=1)
        self.assertIn("curated", how)

    def test_count_unit_from_usda_portion(self):
        g, _ = n.to_grams(line(3, "clove", "count"), n.Profile("x", {}, GARLIC, False, None), FACTORS)
        self.assertEqual(g, 9)  # 3 x the singular 'clove' row, not the 'cloves' x3 row doubled

    def test_each_prefers_medium(self):
        g, _ = n.to_grams(line(2, None, "count"), n.Profile("x", {}, ONION, False, None), FACTORS)
        self.assertEqual(g, 220)

    def test_curated_unit_weight_beats_usda(self):
        g, how = n.to_grams(line(4, "fillet", "count"), n.Profile("x", {"unit_g": {"fillet": 170}}, ONION, False, None), FACTORS)
        self.assertEqual(g, 680)
        self.assertIn("curated", how)

    def test_missing_weight_is_none_not_zero(self):
        g, how = n.to_grams(line(1, "can", "count"), n.Profile("x", {}, ONION, False, None), FACTORS)
        self.assertIsNone(g)
        self.assertIn("can", how)

    def test_no_density_is_none(self):
        g, _ = n.to_grams(line(1, "cup", "volume", 236.588), n.Profile("x", {}, {"portions": [], "per100g": {}}, False, None), FACTORS)
        self.assertIsNone(g)


class Matching(unittest.TestCase):
    def test_rolled_oats_prefers_cereal_over_dinner_rolls(self):
        good = n.score_candidate("rolled oats", "Cereals, oats, regular and quick, not fortified, dry")
        bad = n.score_candidate("rolled oats", "Rolls, dinner, oat bran")
        self.assertGreater(good, bad)

    def test_avocado_prefers_fruit_over_oil(self):
        self.assertGreater(
            n.score_candidate("avocado", "Avocados, raw, all commercial varieties"),
            n.score_candidate("avocado", "Oil, avocado"),
        )


BACON = {"portions": [portion("strip medium", 8), portion("slice, thin", 5), portion("cup, chopped", 120)], "per100g": {"kcal": 541}}
LEMON = {"portions": [portion("wedge", 12), portion("fruit (2-1/8\" dia)", 58)], "per100g": {"kcal": 29}}


class EachRule(unittest.TestCase):
    """Verifier bug: 'each' used to match a 'strip medium' portion (8 g) for a whole item."""

    def test_each_never_picks_a_part_of_the_item(self):
        self.assertIsNone(n.portion_grams(BACON, "each"))

    def test_each_still_finds_the_whole_item(self):
        self.assertEqual(n.portion_grams(LEMON, "each"), 58)


class FakeFdc:
    """Stands in for the USDA client: knows a few foods, finds nothing else."""

    def __init__(self, foods):
        self.foods = foods

    def search(self, name, *a, **k):
        return []

    def food(self, fid):
        return self.foods[fid]


FLOUR_FOOD = {"fdc_id": 1, "description": "Flour", "per100g": {"kcal": 364, "protein_g": 10, "carbs_g": 76, "fat_g": 1}, "portions": [portion("cup", 125)]}
SALT_NO_ENERGY = {"fdc_id": 2, "description": "Partial", "per100g": {"protein_g": 1}, "portions": []}


def recipe(*lines):
    return {"servings": 2, "ingredients": [dict(optional=False, prep=None, **l) for l in lines]}


def ln(name, q, unit="g", kind="mass", factor=1.0):
    return {"name": name, "quantity": q, "unit": unit, "kind": kind, "factor": factor}


class Honesty(unittest.TestCase):
    """The pipeline flags what it cannot do; it never guesses."""

    FACTORS = {"g": 1.0}

    def test_unmatched_ingredient_blocks_the_recipe(self):
        per, rows, flags, blocking = n.compute(
            recipe(ln("flour", 100), ln("unobtainium", 50)),
            {"flour": {"fdc_id": 1}}, FakeFdc({1: FLOUR_FOOD}), self.FACTORS, False)
        self.assertTrue(blocking)
        self.assertIn(("error", "unobtainium: no USDA match"), flags)

    def test_food_without_energy_blocks_the_recipe(self):
        _, _, flags, blocking = n.compute(recipe(ln("x", 10)), {"x": {"fdc_id": 2}}, FakeFdc({2: SALT_NO_ENERGY}), self.FACTORS, False)
        self.assertTrue(blocking)

    def test_unconvertible_unit_blocks_the_recipe(self):
        _, _, flags, blocking = n.compute(recipe(ln("flour", 1, "can", "count", None)), {"flour": {"fdc_id": 1}}, FakeFdc({1: FLOUR_FOOD}), self.FACTORS, False)
        self.assertTrue(blocking)
        self.assertTrue(any("cannot convert" in m for _, m in flags))

    def test_clean_recipe_sums_per_serving(self):
        per, _, flags, blocking = n.compute(recipe(ln("flour", 100)), {"flour": {"fdc_id": 1}}, FakeFdc({1: FLOUR_FOOD}), self.FACTORS, False)
        self.assertFalse(blocking)
        self.assertAlmostEqual(per["kcal"], 182)  # 100 g x 3.64 / 2 servings

    def test_missing_sodium_is_a_note_not_a_hold(self):
        _, _, flags, _ = n.compute(recipe(ln("flour", 100)), {"flour": {"fdc_id": 1}}, FakeFdc({1: FLOUR_FOOD}), self.FACTORS, False)
        self.assertEqual([f[0] for f in flags], ["note"])  # sodium + fibre absent: shown, but status stays OK

    def test_missing_macro_is_a_warning(self):
        food = {"fdc_id": 3, "description": "No fat", "per100g": {"kcal": 100, "protein_g": 1, "carbs_g": 1}, "portions": []}
        _, _, flags, _ = n.compute(recipe(ln("x", 10)), {"x": {"fdc_id": 3}}, FakeFdc({3: food}), self.FACTORS, False)
        self.assertIn("warn", [f[0] for f in flags])


class Forms(unittest.TestCase):
    CMAP = {"white rice": {"fdc_id": 1}, "white rice [cooked]": {"fdc_id": 2}, "chickpeas": {"fdc_id": 3}, "chickpeas [dried]": {"fdc_id": 4}}

    def test_cooked_prep_selects_the_cooked_record(self):
        self.assertEqual(n.form_key("white rice", "cooked and cooled", self.CMAP), "white rice [cooked]")

    def test_no_form_word_keeps_the_base_record(self):
        self.assertEqual(n.form_key("white rice", "rinsed", self.CMAP), "white rice")

    def test_uncooked_is_not_cooked(self):
        self.assertEqual(n.form_key("white rice", "uncooked", self.CMAP), "white rice")

    def test_form_without_an_entry_falls_back(self):
        self.assertEqual(n.form_key("garlic", "cooked", self.CMAP), "garlic")

    def test_dried_chickpeas(self):
        self.assertEqual(n.form_key("chickpeas", "dried, soaked overnight", self.CMAP), "chickpeas [dried]")


class FryingBath(unittest.TestCase):
    OIL = n.Profile("vegetable oil", {"fdc_id": 1, "fry_retained": 0.15}, FLOUR_FOOD, False, None)

    def test_for_frying_note_counts_the_absorbed_share(self):
        self.assertEqual(n.fry_retained({"prep": "for frying"}, self.OIL, 30), 0.15)

    def test_a_cup_of_oil_is_a_bath_even_without_a_note(self):
        self.assertEqual(n.fry_retained({"prep": ""}, self.OIL, 218), 0.15)

    def test_two_tablespoons_for_a_saute_is_counted_in_full(self):
        self.assertIsNone(n.fry_retained({"prep": ""}, self.OIL, 27))

    def test_oils_without_the_flag_are_untouched(self):
        plain = n.Profile("olive oil", {"fdc_id": 1}, FLOUR_FOOD, False, None)
        self.assertIsNone(n.fry_retained({"prep": "for frying"}, plain, 500))


class Extras(unittest.TestCase):
    def test_count_unit_extra_does_not_raise_keyerror(self):
        data = {"unit_kinds": {"clove": "count", "g": "mass"}, "recipes": [{"slug": "r", "ingredients": []}]}
        n.inject_extras(data, ["r:garlic:2:clove"], {"g": 1.0})
        self.assertEqual(data["recipes"][0]["ingredients"][0]["kind"], "count")
        self.assertIsNone(data["recipes"][0]["ingredients"][0]["factor"])

    def test_unitless_extra_is_each(self):
        data = {"unit_kinds": {}, "recipes": [{"slug": "r", "ingredients": []}]}
        n.inject_extras(data, ["r:egg:2:"], {})
        self.assertIsNone(data["recipes"][0]["ingredients"][0]["unit"])

    def test_unknown_unit_is_refused(self):
        with self.assertRaises(SystemExit):
            n.inject_extras({"unit_kinds": {}, "recipes": [{"slug": "r", "ingredients": []}]}, ["r:egg:2:bogus"], {})


if __name__ == "__main__":
    unittest.main(verbosity=2)
