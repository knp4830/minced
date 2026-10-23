"""Reviewed UK -> catalog ingredient-line rewrites for the NHS pilot.

(pattern, replacement, note added to prep_note), applied in order, case-insensitive.
Rule of thumb: drop a word only when it cannot change what is bought or the nutrition;
otherwise the qualifier moves into prep_note, where the nutrition rules read it (a
qualifier with no matching food becomes a named gap, never the default food).
Every applied rewrite is listed in the review sheet (docs/content/RECIPE-REVIEW-w14.md).
"""
from __future__ import annotations

import re

RULES = [
    # "A or B" lines: the first alternative carries the full amount; the other goes in prep_note ("or B") and is never
    # a second required row (the matcher has no either/or, and a split line loses the amount)
    (r"\beasy[- ]cook brown or white rice\b", "brown rice", "or white rice"),
    (r"\bsugar snap peas or green beans\b", "sugar snap peas", "or green beans"),
    (r"\bchicken breast or thigh\b", "chicken breast", "or thigh"),
    (r"\bdried oregano or mixed herbs\b", "dried oregano", "or mixed herbs"),
    (r"\bfresh parsley or chives\b", "fresh parsley", "or chives"),
    (r"\b(vegetable) or chicken stock\b", r"\1 stock", "or chicken stock"),
    (r"\b(?:diced|chopped) tomatoes or 400 ?g passata\b", "diced tomatoes", "or 400 g passata"),
    # UK "400g chopped tomatoes" is the tin (same product as the tinned lines below), not fresh tomatoes
    (r"^(\d+) ?g chopped tomatoes\b", r"1 (\1 g) can diced tomatoes", None),
    # UK tomato puree is the concentrated paste (US tomato paste), not the thin US puree
    (r"\btomato pur\S?e\b", "tomato paste", None),
    # a heaped spoon is more than a level one: keep the word (the parser drops it)
    (r"\bheaped (teaspoons?|tablespoons?)", r"\1", "heaped"),
    # skin and bones matter for poultry nutrition: keep them as qualifiers (a form where we have one, else a named gap)
    (r"\bskinless,? boneless (?=(?:uncooked )?(?:chicken|turkey|duck))", "", "skinless, boneless"),
    (r"\bboneless,? skinless (?=(?:uncooked )?(?:chicken|turkey|duck))", "", "skinless, boneless"),
    (r"\bskinless,? (?=(?:uncooked )?(?:chicken|turkey|duck))", "", "skinless"),
    (r"\bboneless (?=(?:uncooked )?(?:chicken|turkey|duck))", "", "boneless"),
    (r"\bpepper,? any colou?r\b", "bell pepper", None),
    (r"^quarter of an? (small |medium |large )?", r"1/4 \1", None),
    (r"\b(?:lower|low|reduced)-fat spread\b", "margarine", "low fat"),
    (r"\b(?:lower|low|medium|reduced)-fat soft cheese\b(?: with garlic and herbs)?", "cream cheese", "low fat"),
    (r"\breduced-fat (?:mature )?cheddar(?: cheese)?\b", "cheddar cheese", "reduced fat"),
    # the source names no type of hard cheese: do not make it cheddar
    (r"\breduced-fat (?:mature )?hard cheese\b", "cheese", "reduced fat, hard"),
    (r"\b(?:low-fat|zero-fat|0%-fat) greek[- ]style (?:plain )?yogh?urt\b", "greek yogurt", "low fat"),
    (r"\b(?:low-fat|0%-fat) greek yogh?urt\b", "greek yogurt", "low fat"),
    (r"\breduced-(?:fat|calorie) mayonnaise\b", "mayonnaise", "reduced fat"),
    (r"\b1% fat milk\b", "1% milk", None),
    (r"\bextra-lean minced beef\b", "ground beef", "extra lean"),
    (r"\bclosed[- ]cups? mushrooms\b", "mushrooms", None),
    (r"\bcumin powder\b", "ground cumin", None),
    (r"\bmild paprika\b", "paprika", None),
    (r"\bsweet chilli sauce\b", "sweet chili sauce", None),
    (r"\bchinese 5-spice powder\b", "chinese five spice", None),
    (r"\b(?:dried )?italian mixed herbs\b", "italian seasoning", None),
    (r"\b(?:dried )?mixed herbs\b", "italian seasoning", None),
    (r"\bmixed dried herbs\b", "italian seasoning", None),
    (r"\btuna in (?:spring )?water\b", "canned tuna", "in water"),
    (r"\bwhole wheat pitta breads?\b", "pita bread", "whole wheat"),
    (r"\bpitta breads?\b", "pita bread", None),
    (r"\b(?:green|red) seedless grapes\b", "grapes", None),
    (r"\bwhite (potato|cabbage)\b", r"\1", None),
    (r"\bsoft flour tortillas\b", "flour tortillas", None),
    (r"\blettuce leaves\b", "lettuce", None),
    (r"\bmixed salad leaves\b", "mixed greens", None),
    (r"fresh or frozen ", "", None),
    (r"\(fresh or frozen\)", "", None),
    (r"chopped canned tomatoes", "canned diced tomatoes", None),
    (r"\b(\d+) celery sticks\b", r"\1 stalks celery", None),
    # "red chilli powder" is the ground red chilli (the catalog alias), not the US chili-powder spice blend
    (r"\bred (?:chilli|chili) powder\b", "red chilli powder", None),
    (r"\b(?:mild )?(?:chilli|chili) powder\b", "chilli powder", None),
    (r"\bmild paprika powder\b", "paprika", None),
    (r"\b(red|green|yellow|orange) peppers?\b(?! (?:flakes|powder))", r"\1 bell pepper", None),
    (r"\bpepper \(any colou?r\)", "bell pepper", None),
    (r"\b(haddock|cod|salmon) fillets?\b", r"\1", None),
    (r"\breduced-salt ", "", "low sodium"),
    (r"\bdried pasta shapes\b", "pasta", "dried"),
    (r"\bunsweetened apple juice\b", "apple juice", "unsweetened"),
    (r"\bready-to-eat apricots\b", "dried apricots", None),
    (r"\b1%-fat milk\b", "1% milk", None),
    (r"\bhing \(asafoetida powder\)", "asafoetida", None),
    (r"\bsplit mung dhal\b", "moong dal", None),
    (r"\bchickpeas in water\b", "canned chickpeas", None),
    (r"\bhigh-fibre porridge oats\b", "rolled oats", None),
    (r"\bporridge oats\b", "rolled oats", None),
    (r"\bfresh peas\b", "peas", "fresh"),
    (r"^quarter of a teaspoons?\b", "1/4 teaspoon", None),
    (r"^half an? ", "1/2 ", None),
    (r"^an? (?=\w)", "1 ", None),
    (r"\bgarlic gloves\b", "garlic cloves", None),
    (r"^(\d+)\s*g tin(?: of)? (.+)$", r"1 (\1 g) can \2", None),
    (r"^(\d+) tins? (.+?)\s*\((\d+)\s*g\)$", r"\1 (\3 g) can \2", None),
    (r"^(\d+) tins? (?:of )?", r"\1 can ", None),
    (r"\btinned\b", "canned", None),
    (r"\bcanned chopped tomatoes\b", "canned diced tomatoes", None),
    (r"\bcan chopped tomatoes\b", "can diced tomatoes", None),
    (r"\bcelery sticks\b", "celery stalks", None),
    (r"\breduced-salt (vegetable|chicken) stock\b", r"\1 broth", "low sodium"),
    (r"\breduced-salt soy sauce\b", "soy sauce", "low sodium"),
    (r"\b(vegetable|chicken) stock\b", r"\1 broth", None),
    (r"\b(?:low-fat|lower-fat) (?:natural|plain) yoghurt\b", "plain yogurt", "low fat"),
    (r"\b(?:natural|plain) yoghurt\b", "plain yogurt", None),
    (r"\byoghurt\b", "yogurt", None),
    (r"\bhot water\b", "water", "hot"),
    (r"\bground garam masala\b", "garam masala", None),
    (r"\bcoriander powder\b", "ground coriander", None),
    (r"\b(?:fresh )?green chillies\b", "chili peppers", "green"),
    (r"\bred chilli\b(?! powder)", "chili peppers", "red"),
    (r"\bred kidney beans\b", "kidney beans", None),
    (r"\bdried red lentils\b", "red lentils", "dried"),
    (r"\bred split lentils\b", "red lentils", None),
    (r"\bfresh (blueberries|raspberries)\b", r"\1", "fresh"),
    (r"\bfrozen (blueberries|raspberries)\b", r"\1", "frozen"),
    (r"\bskinless,? boneless ", "", None),
    (r"\bskinless ", "", None),
    (r"\bboneless ", "", None),
    (r"\beasy[- ]cook (?:long grain )?", "", None),
    (r"\bdried spaghetti\b", "spaghetti", "dried"),
    (r"\bfresh coriander( leaves)?\b", "fresh cilantro", None),
    (r"\btuna in spring water\b", "canned tuna", "in water"),
    (r"\bpineapple pieces\b", "pineapple", None),
    (r"\bdried curry leaves\b", "curry leaves", "dried"),
    (r"\bcups? or button mushrooms\b", "mushrooms", None),
    (r"\bwholemeal\b", "whole wheat", None),
    (r"\bcucumber cucumber\b", "cucumber", None),
    (r"\bhalf lemon\b", "1/2 lemon", None),
]
DROP = re.compile(r"\bwooden skewers\b", re.I)  # equipment, not an ingredient


def normalise(line: str) -> tuple[str | None, str | None]:
    """Return (rewritten line or None if it is not an ingredient, note for prep_note)."""
    if DROP.search(line):
        return None, None
    notes: list[str] = []
    for pat, rep, note in RULES:
        new = re.sub(pat, rep, line, flags=re.I)
        if new != line and note:
            notes.append(note)
        line = new
    return re.sub(r"\s+", " ", line).strip(), (", ".join(dict.fromkeys(notes)) or None)
