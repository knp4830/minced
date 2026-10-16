#!/usr/bin/env python3
"""Choose which photo-less recipes are worth a search: dishes with a recognisable name.

    python scripts/photos/w8_pick_photoless.py     # cache/w8_photoless.json -> cache/w8_photoless_named.json

Generic USDA titles ("Baked Fish", "Veggie Dip", "Fruit Slush") almost never have an honestly labelled
free photo of THE recipe, and the Openverse budget is 200 requests a day, so the budget goes to
titles that name a dish people actually photograph. The list is a judgement call (kept in this file so
it can be argued with); everything not listed stays on the placeholder.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CACHE, write_json  # noqa: E402

NAMED = """
Atkilt Wat (Ethiopian Cabbage, Potato, and Carrot)|Gomen (Ethiopian Collard Greens)|Misir Wat (Ethiopian Red Lentil Stew)|
Salata Ma Jibna (Salad with Parmesan Cheese)|Red Potato and Cabbage (Colcannon)|Harissa Roast Cauliflower|Gochujang-Glazed Salmon|
Argentinean Grilled Steak with Salsa Criolla|Cajun Catfish|Chicken Spaghetti|Jamaican Curry Chicken|Migas "Crumbs"|Mofonguitos|
Plantain Cups with Shredded Chicken|Fried Rice|Fried Rice with Chicken and Vegetables|Vegetable Fried Rice|Matzo Meal Kugel (Pudding)|
Sweet Potato Casserole|Sweet Potato Cheesecake|Marinara Sauce|Homemade Bagles|Homemade Cranberry Sauce|Roasted Cauliflower Steaks|
Taco Salad|Tostadas|Quesadilla con Huevos|Calabacitas con Elote (Zucchini with Corn)|Chicken Club Salad|Cabbage Roll Casserole|
Turkey Stuffed Cabbage|Black Bean Salsa|Salsa|Pea Guacamole|Fiesta Hummus|Eggplant and Pepper Dip|Avocado Breakfast Bruschetta|
Crustless Pumpkin Pie|Pumpkin Mac & Cheese for One|Peach Crisp|Fig Bars|Caramel Sauce|Banana Split Oatmeal|Easiest Banana Ice Cream|
Red Monster Smoothie|Purple Cow|Veggie Omelet in a Mug|Tuscan Potato Skillet|Slow Cooker Lentil Soup|Lentil Tacos|Mango Cucumber Soup|
Chilled Blueberry Soup|Chilled Cantaloupe Soup|Potato Nachos|English Muffin Veggie Pizza|Red Lentil Latkes|Spinach Potato Pancakes|
Turnip Pancakes|Roasted Root Vegetables|Roasted Herb Potatoes|Broiled Tomatoes and Cheese|Baked Cauliflower Tots|Cuban Beans and Rice|
Creole Beans|Smoky Mustard-Maple Salmon|Citrus Salmon Fillets|Sautéed Walleye with Tarragon|20-Minute Chicken Creole|Beef Pot Roast|
Beef & Noodles|Broccoli Alfredo|Broccoli-Cheddar Frittata|Brown Rice Pilaf|Bulgur Chickpea Salad|Butternut Squash with Black Beans|
Cheese and Corn Chowder|Chicken Waldorf Salad|Chicken Pasta Salad|Chili Cheese Hominy|Creamy Dill Dip|Curried Potatoes|Dutch Green Beans|
Easy Baked Acorn Squash|Eggplant Stir Fry|Eggs over Kale and Sweet Potato Grits|Fruit Salsa|Garlic Ginger Ramen with Beef|
Golden Split Pea Soup|Grape Salsa|Grapefruit Spinach Salad|Grilled Fruit|Grilled Vegetable Packets|Healthy Black Bean Soup|Italian Pasta Salad|
Layered Black Bean Dip|Lemon Dill Brussels Sprouts|Lentil Barley Soup|Lentil Spaghetti Sauce|Macaroni & Cheese with Broccoli|Mango Berry Rotini Salad|
Marinated Three-Bean Salad|Mashed Parsnips and Potatoes|One Pan Spaghetti|Orange Pork Chops|Pasta Primavera in Spaghetti Sauce|Peach Cooler|
Pumpkin Chili|Pumpkin Ricotta Stuffed Shells|Quick Skillet Lasagna|Roast Turkey Breast with Rosemary, Sage, and Thyme|Salmon Loaf|
Sautéed Cabbage and Onion|Scalloped Potatoes II|Slow Cooker Cheesy Swiss Steak|Somali Summer Salad|Spaghetti Squash with Tomatoes, Basil, and Parmesan|
Strawberry S'Mores|Sweet and Sour Cabbage|Sweet Potato Harvest Salad|Tofu Salad|Tuna Veggie Antipasto|Vegetarian Chili|Walleye Chowder|White Chicken Chili|
Zucchini Au Gratin|Zucchini Casserole
""".replace("\n", "")


def main() -> None:
    want = {t.strip() for t in NAMED.split("|") if t.strip()}
    rows = json.loads((CACHE / "w8_photoless.json").read_text(encoding="utf-8"))
    picked = [r for r in rows if r["title"] in want]
    missing = want - {r["title"] for r in rows}
    write_json(CACHE / "w8_photoless_named.json", picked)
    print(len(picked), "recipes;", len(missing), "names not found:", sorted(missing)[:10])


if __name__ == "__main__":
    main()
