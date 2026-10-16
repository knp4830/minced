#!/usr/bin/env python3
"""Record the second look at photos rated 1-2 on the first pass that were kept after all.

    python scripts/photos/w8_second_look.py

The first pass rated from small contact-sheet tiles; the second opened each low-rated photo at larger size
(cache/w8/lowsheets). Soft by the Laplacian number but fine to the eye (smooth soups, shallow depth of field
on purpose) are kept; a photo is only removed for a visible defect: clutter/brand text/hands, tiny size,
unappetising colour, dish not recognisable. Edits manifest/quality_decisions.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import MANIFEST_DIR, write_json  # noqa: E402

KEPT = {
    "butternut-squash-apple-soup": "smooth puree soup: low edge detail is the dish, the bowl and cream swirl are sharp",
    "corn-toasties": "stack of fritters, deliberate shallow depth of field, clean white ground (USDA 600x400)",
    "mousse-la-banana": "clear jar shot with banana slice, attractive (USDA 600x400)",
    "orange-delight-juice": "bright, clean (USDA 600x400)",
    "pear-orange-sauce": "pear in sauce, subject sharp, background blur is deliberate (USDA 600x400)",
    "peanut-butter-banana-smoothie": "attractive, subject sharp (USDA 600x400)",
    "vegetarian-matzo-ball-soup": "subject sharp, background blur deliberate; appetising",
    "mercimek-corbasi": "clean soup on white, nothing wrong",
    "frosted-cake": "clean cake on stand",
    "homemade-mashed-potatoes": "plain but clean and sharp enough",
    "black-bean-quesadillas": "appetising close-up, sharp",
    "blueberry-coffee-cake": "close-up; the crumb is in focus, the upper blur is depth of field",
    "cucumber-salad-tomatoes": "fresh close-up, sharp enough",
    "egg-salad": "tight macro but clear and honest",
    "escovitch-fish": "shows the pickled fish with onion and carrot, as the recipe does",
    "falafel-yogurt-sandwich": "falafel pita with background blur by design",
    "mixed-fruit-salad": "colourful, appetising",
    "mock-southern-sweet-potato-pie": "clean slice on plate",
    "parsnip-soup": "plain soup, clean",
    "refried-beans": "clean bowl",
    "salmon-burgers": "clear burger plate",
    "skillet-pasta-dinner": "clean bowl",
    "sugar-and-spice-cookies-better-baking-mix": "soft pastel cookies, nothing wrong",
    "veggie-quesadillas": "close, appetising",
    "vegetable-salad": "fresh salad, clear",
}


def main() -> None:
    f = MANIFEST_DIR / "quality_decisions.json"
    dec = json.loads(f.read_text(encoding="utf-8"))
    n = 0
    for slug, why in KEPT.items():
        if slug in dec:
            dec[slug] = {"score": 3, "verdict": "keep", "reason": f"second look at full size: {why}"}
            n += 1
    write_json(f, dec)
    print(n, "photos moved from replace to keep")


if __name__ == "__main__":
    main()
