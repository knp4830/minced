"""Reviewed line rewrites for the rescued USDA MyPlate recipes (wave 14). Same contract as scripts/nhs/rules.py:
(pattern, replacement, note for prep_note), applied in order, case-insensitive. Only true equivalences; a qualifier
that changes nutrition moves into prep_note (the nutrition rules read it, and a qualifier with no food is a named gap).
Lines that are not food (equipment) are dropped.
"""
from __future__ import annotations

import re

RULES = [
    (r"\blow-sodium (?:dark red )?(?:red )?kidney beans\b", "kidney beans", "low sodium"),
    (r"\blow-sodium garbanzo beans\b", "chickpeas", "low sodium"),
    (r"\bno salt added diced tomatoes\b", "diced tomatoes", "no salt added"),
    (r"\blow-fat cottage cheese\b", "cottage cheese", "low fat"),
    (r"\blow-fat strawberry yogurt\b", "strawberry yogurt", "low fat"),
    (r"\bpart[- ]skim mozzarella cheese\b", "mozzarella", "part skim"),
    (r"\b(?:light|fat-free) frozen whipped topping\b", "whipped topping", "light"),
    (r"\bfresh lime juice\b", "lime juice", None),
    (r"\bcrushed red pepper flakes\b", "crushed red pepper", None),
    (r"\b(banana|mango|pineapple) (?:slices|pieces)\b", r"\1", None),
    (r"^(\d+(?:/\d+)?(?: \d+/\d+)? (?:teaspoons?|tsp|tablespoons?|tbsp)) vanilla(?![ -]?(?:extract|bean|yogurt|pudding|ice|wafer|flavou?r))\b", r"\1 vanilla extract", None),
    (r"\bboneless,? skinless ", "", None),
    (r"\bskinless,? boneless ", "", None),
    (r"\bcornflakes\b", "corn flakes", None),
    (r"\bitalian herb seasoning\b", "italian seasoning", None),
    (r"\byellow cornmeal\b", "cornmeal", None),
    (r"\blow-sodium (green )?peas\b", "peas", "low sodium"),
    (r"\b(macaroni|rotini) pasta\b", r"\1", None),
    (r"\bdry macaroni\b", "macaroni", "dry"),
    (r"\bmonterey jack cheese\b", "monterey jack", None),
    (r"\bpart-skim mozzarella\b", "mozzarella", "part skim"),
    (r"\bfresh (cilantro|parsley) leaves\b", r"fresh \1", None),
    (r"\bno salt added tomato paste\b", "tomato paste", "no salt added"),
    (r"\blight butter\b", "butter", "light"),
    (r"\bhot pepper sauce\b", "hot sauce", None),
    (r"\bspray non-sticks? cooking spray\b", "cooking spray", None),
    (r"\b(\d+) sprays? of nonstick vegetable spray\b", "cooking spray", None),
    (r"\bripe (banana|bananas|avocado|avocados|tomato|tomatoes)\b", r"\1", None),
    (r"\bripe, fresh avocado\b", "avocado", None),
]
DROP = re.compile(
    r"\b(popsicle sticks?|paper (cups?|straws?)|mini muffin cups?|drinking glasses|parfait cups?|ice cubes? tray|"
    r"bamboo skewers?|skewers?|straws?)\b|^straws$",
    re.I,
)


def normalise(line: str) -> tuple[str | None, str | None]:
    if DROP.search(line):
        return None, None
    notes: list[str] = []
    for pat, rep, note in RULES:
        new = re.sub(pat, rep, line, flags=re.I)
        if new != line and note:
            notes.append(note)
        line = new
    return re.sub(r"\s+", " ", line).strip(), (", ".join(dict.fromkeys(notes)) or None)
