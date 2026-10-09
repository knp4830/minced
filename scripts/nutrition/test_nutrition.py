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


if __name__ == "__main__":
    unittest.main(verbosity=2)
