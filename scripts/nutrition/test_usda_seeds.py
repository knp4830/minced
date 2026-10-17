"""Offline tests for the wave-10 USDA seed pipeline.  python -I scripts/nutrition/test_usda_seeds.py

Needs the bulk CSVs (download_bulk.py) and bulk/ings.json (a database export); skips if absent.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mapping  # noqa: E402
import portions as pt  # noqa: E402
import usda_bulk as ub  # noqa: E402

HAVE_DATA = os.path.exists(os.path.join(ub.BULK, "sr", "food.csv")) and os.path.exists(os.path.join(ub.BULK, "ings.json"))


class PortionRules(unittest.TestCase):
    def food(self, *portions):
        return {"portions": [dict(amount=a, unit=u, modifier=m, description="", grams=g) for a, u, m, g in portions]}

    def test_each_never_picks_a_part_of_the_item(self):
        f = self.food((1, "", "slice, large", 38), (1, "", "medium (2-1/2\" dia)", 110), (1, "", "small", 70))
        self.assertEqual(pt.count_grams(f, "each"), 110)
        self.assertEqual(pt.count_grams(f, "slice"), 38)

    def test_unit_words_match_whole_words(self):
        f = self.food((1, "", "clove", 3), (3, "", "cloves", 9))
        self.assertEqual(pt.count_grams(f, "clove"), 3)
        self.assertIsNone(pt.count_grams(f, "stalk"))

    def test_serving_of_a_fraction_of_a_cup(self):
        f = self.food((1, "", "serving 1/2 cup", 132))
        self.assertAlmostEqual(pt.volume_grams_per_unit(f)["cup"], 264)
        self.assertAlmostEqual(pt.density(f), 264 / 236.588, places=3)

    def test_half_cup_amount(self):
        f = self.food((0.5, "", "cup, chopped or diced", 44))
        self.assertAlmostEqual(pt.volume_grams_per_unit(f)["cup"], 88)

    def test_mass_labels_are_not_counts(self):
        f = self.food((4, "", "oz", 113), (1, "", "package", 926))
        self.assertIsNone(pt.count_grams(f, "each"))

    def test_no_volume_portion_means_no_density(self):
        self.assertIsNone(pt.density(self.food((1, "", "medium", 118))))


@unittest.skipUnless(HAVE_DATA, "bulk data / ings.json not present")
class Mapping(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.foods = ub.load_all(("sr", "foundation", "fndds"))
        cls.branded = mapping.branded_cache()
        cls.ings = {i["name"]: i for i in json.load(open(os.path.join(ub.BULK, "ings.json"), encoding="utf-8"))}
        cls.data = mapping.load()

    def test_every_mapped_food_exists(self):
        for ing, form, fdc, *_ in self.data["foods"] + self.data["alts"]:
            self.assertTrue(fdc in self.foods or fdc in self.branded, f"{ing} [{form}] fdc {fdc}")

    def test_every_mapped_ingredient_is_canonical(self):
        for ing, *_ in self.data["foods"] + self.data["alts"] + self.data["skips"] + self.data["densities"]:
            self.assertIn(ing, self.ings)

    def test_no_ingredient_is_both_mapped_and_skipped(self):
        mapped = {a for a, b, *_ in self.data["foods"] if b == "default"} | {s[0] for s in self.data["sames"]}
        skipped = {s[0] for s in self.data["skips"]}
        self.assertFalse(mapped & skipped)

    def test_exactly_one_default_food_per_ingredient_and_form(self):
        seen = set()
        for ing, form, *_ in self.data["foods"]:
            self.assertNotIn((ing, form), seen)
            seen.add((ing, form))

    def test_every_form_has_a_default_form(self):
        existing = mapping.existing_map()
        have = {a for a, b, *_ in self.data["foods"] if b == "default"} | {k for k in existing if "[" not in k}
        for ing, form, *_ in self.data["foods"]:
            self.assertIn(ing, have, f"{ing} [{form}] has no default form")

    def test_newly_mapped_foods_can_produce_energy(self):
        for ing, form, fdc, conf, *_ in self.data["foods"]:
            f = self.foods.get(fdc)
            if f is None:
                continue
            self.assertIn(1008, ub.normalise(f["nutrients"]), f"{ing} fdc {fdc} reports no energy")

    def test_branded_records_are_labelled(self):
        for fid, f in self.branded.items():
            self.assertEqual(f["data_type"], "branded")
            self.assertTrue(f.get("brand_owner"), fid)


class NutrientIds(unittest.TestCase):
    def test_uses_four_digit_csv_ids_not_api_numbers(self):
        self.assertTrue(all(k >= 1000 for k in ub.NUTRIENTS))  # API numbers are 3 digits (301, 307...)

    def test_hidden_source_rows_are_loaded_raw(self):
        raw = {1110: 100.0, 2048: 250.0}
        self.assertEqual(ub.normalise(dict(raw))[1008], 250.0)
        self.assertAlmostEqual(ub.normalise(dict(raw))[1114], 2.5)


if __name__ == "__main__":
    unittest.main(verbosity=1)
