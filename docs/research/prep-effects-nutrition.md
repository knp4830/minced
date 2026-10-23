# How preparation changes nutrition, part 2: what Minced can compute, note, or leave alone

**Research notes, not medical or dietary advice.** Prepared 2026-10-22 for the owner (wave 14, research lane). No code, schema or data was changed. This builds on `docs/research/food-science-nutrition.md` (the "part 1 brief") and does not repeat it; section references like "part 1 section 3" point there.

## 0. How to read this

Accuracy comes first, so every claim carries a grade and a note on what I actually read.

| Grade | Meaning |
|---|---|
| **[strong]** | A government dataset I opened myself, or many concordant studies / a regulator's opinion |
| **[moderate]** | A good primary study or review whose abstract I read, small or narrow |
| **[weak]** | One small study, an animal / in-vitro result, or only secondary coverage seen |
| **[unverified]** | Widely repeated, but I could not find or open a primary source. Do not print it |

What I verified directly this time (rather than relying on summaries):

- I **downloaded and parsed the USDA Retention Factors Release 6 data file and PDF** (`retn06.txt`, `retn06.pdf`). Everything about its structure and every factor quoted in section 2 comes from that file.
- I confirmed the **licence** on the data.gov record (section 2.1).
- I read the **PubMed abstracts** for: Song & Milner 2001; Rock 1998; Rungapamestry 2007; Unlu 2005 and 2007; Palermo 2014; Nugrahedi 2015; Raatz 2016; Shohag 2012; Ioku 2001; Gebauer 2016. Full texts were not read, so sample details beyond the abstract are not claimed.
- I saw **only secondary coverage** of: Okunade 2018, the EFSA acrylamide opinion, SACN on blended fruit, Rickman 2007, the fresh-cut vitamin C study, the 2022 pasta digestion study, and the kidney bean (PHA) guidance. They are graded accordingly.

Corrections to part 1: it said the ARS page states no licence and left the retention definition open. Both are now resolved (section 2).

## 1. The answer in one table

Three buckets, as the owner asked.

| Effect | Bucket | What we know | Grade | Minced treatment |
|---|---|---|---|---|
| Vitamin C, B vitamins, folate, minerals lost when boiled and drained | **(a) content** | Quantified in USDA retention factors | strong | **Compute**, as an estimate |
| Same nutrients when the cooking liquid is eaten (soup, stew, rice absorbed) | **(a) content** | Table has separate "water used" / "with drippings" codes with higher retention | strong | **Compute** |
| Alcohol remaining after cooking with wine, beer, spirits | **(a) content** | USDA/Augustin 1992 factors by method and time | strong | **Compute** (see 2.4, if alcohol is counted at all) |
| Beta-carotene, lycopene, lutein content after cooking | (a) content | Table says 70-100% retained; real change is mostly absorption | strong (content) | Compute only the content; **note** the absorption |
| Carotenoid / lycopene absorption with fat and heat | **(b) bioavailability** | Several human trials, up to several-fold differences | moderate | **Note only** |
| Garlic allicin when crushed, rested, then heated | (b) | Real chemistry; human evidence thin | moderate (chemistry), weak (health) | **Note only** |
| Broccoli sulforaphane: chopping, cooking, mustard | (b) | Cooking time changes yield about 3-fold in people | moderate | **Note only** |
| Resistant starch from cooled rice and potato | (b) | Real, small (about 1 g per 100 g) | moderate | Note only |
| Starch gelatinisation (al dente vs soft pasta, glycaemic response) | (b) | Direction supported, no label number | weak to moderate | Do not claim |
| Soaking, sprouting, fermenting (phytate, folate, vitamin C) | (b), partly (a) | Sprouting raises some vitamins measurably; absorption effects separate | moderate | Note only |
| Chopping, shredding and standing: vitamin C oxidation | (a) in principle | Large in one small study; no standard factor | weak | Do not compute; at most a tip |
| Juicing removes fibre | (a) arithmetic | Fibre in discarded pulp is gone | strong | Only if a recipe says to discard pulp |
| Blending is "bad for you", sugar spikes, fibre destroyed | **(c) myth / unsettled** | Not supported (part 1 section 7) | moderate | Do not claim |
| "Microwaving destroys nutrients", "raw is always best" | (c) | Not supported; water and time drive loss, not microwaves | moderate | Do not claim |
| Nuts: whole vs chopped vs butter absorbed energy | (b) | Chopping and roasting raise absorbed energy about 10-14% in one trial | moderate | Do not adjust labels; Atwater convention |
| Acrylamide from high-heat cooking | safety | Regulator concern based on animal data | strong | Note at most; never a number |
| Raw/undercooked kidney beans (lectin PHA) | safety | Real poisoning, slow cookers implicated | moderate (secondary only) | Make sure our own step text is safe |

## 2. USDA Table of Nutrient Retention Factors, Release 6: what is really in it

### 2.1 Licence: we may store it

- The Ag Data Commons / data.gov record lists the licence as **Creative Commons CC0 1.0** (public domain dedication), `accessRights: public`, publisher Agricultural Research Service, DOI `10.15482/USDA.ADC/1409034`, record modified 2025-11-22. I read this on the data.gov catalog page: https://catalog.data.gov/dataset/usda-table-of-nutrient-retention-factors-release-6-2007 **[strong]**
- The original ARS page (https://www.ars.usda.gov/Services/docs.htm?docid=9448) carries no licence statement of its own, and the Ag Data Commons page itself returned HTTP 403 to my fetch. USDA publications are also generally US-government works. Two independent routes to "free to store".
- Bottom line for the project's "confirmed licence" rule: **yes, we may store and redistribute the factors**, with attribution as good practice. Suggested one-time step: whoever integrates opens the data.gov page and records the date and licence line in `docs/` next to the other source licences.

### 2.2 What the file contains (measured)

- **270 retention codes**, each a food-group code plus a preparation, with factors for **26 components**: calcium, iron, magnesium, phosphorus, potassium, sodium, zinc, copper; vitamin C; thiamin, riboflavin, niacin, B6, B12; folate (total, food, folic acid); vitamin A (RE and IU); alpha-carotene, beta-carotene, beta-cryptoxanthin, lycopene, lutein+zeaxanthin; total choline; alcohol.
- **Not covered at all**: calories, protein, fat, carbohydrate, fibre, sugars, **vitamins D, E and K**, pantothenic acid, selenium, manganese, and every phytochemical (allicin, glucosinolates, polyphenols, quercetin). The Me dashboard lists D, E and K, so for those we would have to say "not adjusted".
- **Definition**: most factors are **true retention**, `%TR = (Nc x Gc) / (Nr x Gr) x 100`: nutrient in the cooked food as a share of nutrient in the raw food that went in, correcting for weight change. Where weights were missing, an apparent (dry-weight) method was used. The PDF does not mark which factor used which method.
- **Rounded to the nearest 5%**, and values above 100 are reported as 100. So a factor of 80 means "somewhere about 78-82", and a true gain (for example from matrix softening) is invisible.
- **Many factors are imputed**, not measured. USDA says some were "imputed" from similar foods and methods and gives choline as an explicit example (12 foods analysed, the rest imputed). The file does not flag which rows are analytical, so we cannot show a per-row confidence.
- **Grouping is coarse**: 13 food groups (the numbering matches the SR food groups: dairy and egg, poultry, cereals, fruits, pork, vegetables, nuts, beef, beverages, fish and shellfish, legumes, lamb/veal, grains and pasta; confirm against the FdGrp_Cd table when importing). Vegetables, which matter most, have only three generic classes (**greens**, **roots etc.**, **other**) plus separate potato, sweet potato and tomato codes. Broccoli, peppers, onions, zucchini and green beans would all be "VEG,OTHER", which is an inference of mine, not a statement in the file.
- **No microwave code exists** (zero matches). Steamed exists for "other" veg, roots and shellfish only.
- **Odd values to watch**: pasta boiled and drained shows potassium 30% (looks like an outlier or a data error; the same pasta "not drained" is 100%); pasta carries a vitamin C factor although pasta has none (harmless, multiplied by zero); the `Date` column is "09/1975" on all 7,018 rows (a placeholder, not a real analysis date). Release 6 keeps older factors for most foods; some date from the 1970s-80s. Treat all of it as **averages, not measurements of your dish**.

### 2.3 What the factors look like (verbatim from the file)

Percent retained, true retention. C = vitamin C, Fol = total folate, B1 = thiamin, bC = beta-carotene.

| Code | Preparation | C | Fol | B1 | bC |
|---|---|---|---|---|---|
| 3005 | Greens, boiled, covered with water, drained | 55 | 60 | 80 | 95 |
| 3006 | Greens, boiled, **water used** | 70 | 75 | 90 | 95 |
| 3015 | Greens, stir-fried | 85 | 85 | 90 | 90 |
| 3775 | Other veg, boiled, water cover, drained | 75 | 65 | 80 | 90 |
| 3776 | Other veg, boiled, **water used** | 85 | 85 | 90 | 95 |
| 3784 | Other veg, steamed | 85 | 85 | 90 | 95 |
| 3785 | Other veg, stir-fried | 85 | 80 | 90 | 90 |
| 3780 | Other veg, fried | 85 | 70 | 85 | 85 |
| 3771 | Other veg, baked | 85 | 85 | 90 | 95 |
| 3455 | Roots etc., boiled, water cover, drained | 65 | 65 | 80 | 90 |
| 3308 | Potatoes, boiled pared, drained | 75 | 75 | 80 | 100 |
| 3751 | Tomatoes, boiled/baked (lycopene 95) | 95 | 70 | 95 | 95 |
| 0521 | Legumes, cooked 45-75 min, boiled, drained | 65 | 45 | 60 | 85 |
| 0541 | Legumes, cooked 2-2.5 h, boiled, drained | 65 | 30 | 40 | 85 |
| 0381 | Pasta, boiled, drained | 70 | 70 | 65 | 95 |
| 0431 | Rice, cooked, drained | 75 | 60 | 75 | 95 |
| 0601 | Beef, roasted | 80 | 95 | 55 | 75 |

Reading it honestly:

- The direction matches the literature in part 1 section 2 and Palermo 2014 (below): **draining boiling water costs the most; eating the liquid recovers 10-20 points; steaming and stir-fry sit in between.** Beta-carotene barely moves (the real change is absorption, section 3.3).
- The gap between "drained" and "water used" is exactly the flag part 1 proposed (`liquid_retained`). The table already encodes it, so we would not invent a rule.
- Differences of 5-10 points are inside the table's own rounding and imputation noise. Do not present them as meaningful distinctions between recipes.

### 2.4 Alcohol: the cleanest computable case

Beverage codes (Augustin et al. 1992, J Am Diet Assoc 92:486-488, an analytical study) give **ethanol retained**: flamed 75%; added to hot liquid and stirred in 85%; no heat, stored overnight 70%; baked or simmered, stirred in: 15 min 40%, 30 min 35%, 1 h 25%, 1.5 h 20%, 2 h 10%; not stirred in, baked 25 min 45%. **[strong, from the file]**. Alcohol is 7 kcal per gram, so a recipe with a cup of wine that simmers for an hour keeps a quarter of those calories rather than all of them. Whether this matters depends on whether Minced counts ethanol energy today (open question O3).

### 2.5 The table is not a substitute for analysed cooked foods

Minced already supports cooked forms (`ingredient_foods.form`, part of the nutrition schema; the part 1 brief predates it). Rule of precedence for any ingredient: **(1)** a recipe line that says "cooked" (or measures cooked weight) uses the analysed cooked food, no factor; **(2)** a raw line followed by a clear single cooking verb gets a retention factor; **(3)** otherwise raw values stand. Applying a factor to a cooked-food row would double-count the loss.

### 2.6 How to apply a true-retention factor correctly

USDA's own worked example (28 mg vitamin C per 100 g raw spinach x 0.85 = 23.8 mg per 100 g cooked) multiplies a per-100 g value without a yield step, which is only right if weight does not change; it does (greens shrink, rice and pasta swell). True retention is defined on the **whole amount**: nutrient in what you ended with = nutrient in the raw amount you started with x factor. Recipes in Minced list **raw weights**, so the correct and simple use is:

`nutrient in the cooked dish = (grams of raw ingredient / 100) x raw nutrient per 100 g x factor`

No yield table needed, and per-serving totals stay correct. Do not use the factor to build a "per 100 g cooked" figure without a yield. This is a place where an obvious shortcut silently gives wrong numbers; put it in LESSONS if built. **[strong: derived from the file's own definition]**

## 3. Evidence by operation

### 3.1 Cutting, crushing, grating, shredding

- **Garlic (alliinase and allicin).** Crushing mixes alliin with the enzyme alliinase, which makes allicin and the other sulfur compounds. Song & Milner 2001 (*J Nutr* 131:1054S-1057S, rat study of anticancer markers): 60 s of microwave or 45 min of oven heat blocked garlic's effect; letting crushed garlic **stand 10 min before** 60 s of microwaving prevented total loss; the authors tied this to alliinase inactivation. **[moderate for the enzyme chemistry, weak for any human health meaning: animal data, a surrogate endpoint]**. Practical, harmless tip: crush or chop, wait about 10 minutes, then cook. Do not print allicin amounts. Not covered by USDA.
- **Cruciferous vegetables (myrosinase and sulforaphane).** Broccoli makes sulforaphane when chopping lets the enzyme myrosinase meet glucoraphanin; heat destroys the enzyme. In 12 volunteers Rungapamestry 2007 (*Br J Nutr* 97:644-652) found sulforaphane yield about **3-fold higher after lightly cooked (2 min microwave) than fully cooked (5.5 min)** broccoli, and the cooking method mattered more than the rest of the meal. **[moderate]** Okunade 2018 (*Mol Nutr Food Res*, 12 adults, secondary summary seen) reported more than 4-fold higher urinary sulforaphane metabolites when 1 g of brown mustard powder, which carries active myrosinase, was added to cooked broccoli. **[moderate, abstract-level via secondary]** The popular "chop and wait 40 minutes" rule traces to a book; I found **no controlled trial** for that exact time. **[unverified]**
- **Brassica glucosinolate content (not the same as sulforaphane).** Nugrahedi 2015 (*Crit Rev Food Sci Nutr* 55:823-838): boiling and blanching considerably cut glucosinolates through leaching and heat; steaming, microwave and stir-frying keep most or slightly reduce them; fermentation reduces them. **[moderate]**
- **Vitamin C when produce is cut and left standing.** A small Polish study (found via search; I could not retrieve its citation) reported washing and shredding cut vitamin C by about 21% in tomato and 37% in cucumber, with further losses the longer a mixed salad stood (over 50% after 2 hours in the tomato-cucumber salad). Brazilian restaurant data show large cumulative storage and prep losses. **[weak: citation not confirmed, conditions vary]** Direction (cut surface plus air plus time lowers vitamin C) is plausible and consistent; the size is not transferable. **No standard factor exists. Do not compute.**
- **Grating** is cutting with more surface; same direction, same lack of a factor. No Minced claim.
- **Onion**: boiling lost about 30% of quercetin glycosides to the water; frying did not reduce flavonoid intake; microwaving without water retained flavonoids and vitamin C best (Ioku 2001, *J Nutr Sci Vitaminol* 47:78-83). **[moderate]** This is the clearest direct evidence that **microwaving is not harmful per se; the water is what costs you.**

### 3.2 Blending and juicing

Part 1 section 7 stands. Additions:

- **Free sugars.** The UK SACN approach (and, per that paper, a very similar WHO 2015 definition) classes sugars in fruit and vegetables that have been **blended, pulped or puréed** as free sugars because the cell structure is broken, while whole fruit's sugars are not. I read this only through a secondary paper; I did not confirm WHO's own wording on blending. **[moderate for SACN, unverified for WHO]**. This is a definition for dietary guidance, not a measured effect on your blood sugar, and it conflicts with the one small glucose trial in part 1. Do not label blended recipes as "free sugar" or "sugar-spiking". Minced stores no free-sugar value anyway.
- **Fibre.** Blending keeps the fibre in the glass; juicing with pulp discarded removes it. If a recipe says "strain" or "discard the pulp", the fibre of that ingredient is genuinely gone. This is arithmetic, not a research claim.
- **Oxidation.** Cut or pulped produce loses vitamin C and some polyphenols as it stands in air (see 3.1); fresh juice is best drunk soon. **[weak, no figure]**

### 3.3 Heat and fat: carotenoids and lycopene (absorption, bucket b)

Part 1 section 3 covers Gartner 1997 and Brown 2004. New primary results (abstracts read):

- **Rock 1998** (*J Nutr* 128:913-916; 8 women, 4-week crossover): plasma beta-carotene rose about **3-fold more** on thermally processed and pureed carrots and spinach than on the same beta-carotene dose from raw. P = 0.09 for that comparison, so it is suggestive, not firm. **[moderate to weak]**
- **Unlu 2005** (*J Nutr* 135:431-436; 11 per study, crossover): adding avocado (150 g) to salsa raised lycopene absorption **4.4x** and beta-carotene 2.6x; to salad, alpha-carotene 7.2x, beta-carotene 15.3x, lutein 5.1x; avocado oil did as well, so **fat is the active ingredient**. **[moderate]**
- **Unlu 2007** (*Br J Nutr* 98:140-146; 12 subjects): lycopene from a heat-treated, **cis-isomer-rich** tomato sauce was absorbed better than from an all-trans-rich sauce (7.30 vs 4.74 nmol h/l AUC adjusted). **[moderate]**
- **Palermo 2014** (*J Sci Food Agric* 94:1057-1070, review of over 100 articles): cooking has two opposite effects, thermal degradation and matrix softening that frees compounds; **steaming best preserves phenols and glucosinolates; carotenes can rise with severe processing**. Variability between studies is large. **[moderate]**

Consequence: the USDA table says tomato lycopene is 90-95% retained after cooking, which is true as **content**; the nutritionally interesting change (more absorbed when cooked with oil) is **not** in any content number and must stay a note.

### 3.4 Water-soluble vitamins and the cooking method

Part 1 section 2 holds. Two additions:

- **Frozen vs canned vs fresh** (Rickman, Barrett & Bruhn 2007, *J Sci Food Agric* 87:930-944): initial heat processing cuts vitamin C and B vitamins, but canned and frozen products often land near fresh produce that has been stored; frozen loses more during storage. The review was commissioned by the Canned Food Alliance. **[moderate; sponsor noted; abstract via secondary]**. Relevance: our fresh-vs-frozen ingredient choice is not a nutritional claim we can make.
- **Legumes** show the biggest cooking losses in the table (folate 30-45% retained after long boiling and draining, thiamin 40-60%). Dried beans are usually cooked in their liquid in recipes, which the "water used" codes (folate 35-65%) cover. **[strong, from the file]**

### 3.5 Soaking, sprouting, fermenting, peeling

- **Soaking / fermenting and phytate**: part 1 section 8 stands (absorption, not content).
- **Sprouting does change content**: Shohag 2012 (*J Agric Food Chem* 60:9137-9143): in soybean and mung bean, total folate peaked on day 4 at about **815 and 675 µg per 100 g fresh weight (3.5x and 3.9x the seed)** then fell; vitamin C, absent in the dry seed, reached about 29 and 28 mg per 100 g. **[moderate]**, lab germination conditions. We would need to treat "sprouts" as their own ingredient with their own analysed food; no formula from seed to sprout.
- **Fermentation**: reduces glucosinolates (Nugrahedi 2015). Lactic fermentation of cauliflower and white beans changed riboflavin, folate and B12 content (Thompson 2020, *Plant Foods Hum Nutr*; I saw the title only). **[unverified for any number]**. Plant ferments are not a reliable B12 source; do not imply it.
- **Peeling**: the table separates "boiled in skin" and "pared" for potatoes and sweet potatoes, with differences of 0-15 points depending on the nutrient (for example potato boiled in skin keeps folate 90 vs 75 pared and drained). Skins also hold much of the fibre and phenolics, but I found no primary source I could verify for a general figure. **[weak outside the table]**. If a recipe peels, the ingredient weight is normally already edible portion; do not double-adjust.

### 3.6 Cooking methods and starch

- **Resistant starch** (part 1 section 6) now has USDA-ARS data too: Raatz 2016 (*Food Chem* 208:297-300) found resistant starch in potatoes **differs by cooking method and serving temperature, not variety; baked > boiled, chilled > hot or reheated**. The abstract gives no numbers. **[moderate]** Still small in absolute terms; keep as a note.
- **Cooking time and starch digestion**: a 2022 in-vitro study of durum spaghetti (seen via search only) found shorter, al dente cooking reduced starch digestion. It is a lab digestion model, not a blood glucose result. **[weak]**. Do not claim "lower GI" for any recipe.
- **Frying and absorbed energy**: part 1 section 4 stands. A recipe that lists oil for pan-frying probably overcounts calories; the same is likely for **salt in pasta water** (listed salt is mostly discarded). I did not find a verified figure for either. Record both as known directions of error.
- **Nuts**: Gebauer 2016 (*Food Funct* 7:4231-4238; 18 people): measured metabolisable energy 4.42 kcal/g (whole natural), 4.86 (whole roasted), 5.04 (chopped), 6.53 (butter, similar to the Atwater prediction). So **chopping or roasting raised absorbed energy by about 10-14% compared with whole natural almonds, yet all are below the labelled figure for whole nuts.** **[moderate]**. Nutrition labels use Atwater by convention; keep that and, at most, add a note.

### 3.7 Safety items that touch our own step text (not nutrition)

- **Acrylamide**: forms above about 120 C in starchy foods with low moisture (EFSA CONTAM Panel 2015, *EFSA Journal* 13(6):4104). The Panel found current exposure not of concern for non-cancer effects; for cancer the animal evidence gives a margin of exposure that "indicates a concern", while human epidemiology has not shown it to be a human carcinogen. Potato fried products are the main contributor, and home cooking choices matter. **[strong, abstract via secondary]**. A short, calm note ("golden, not dark brown") is defensible; a number or health claim is not.
- **Red kidney beans**: undercooked beans contain the lectin PHA, and four or five beans can make a person ill. Guidance repeated by university extension sources and attributed to the FDA's Bad Bug Book: boil vigorously for 10-30 minutes (30 for margin), and avoid slow cookers for raw dried beans. I did not open the Bad Bug Book. **[moderate, secondary only]**. **Action for the owner's review queue, independent of this feature**: scan our recipes for dried kidney beans in a slow-cooker step.

## 4. Myths and weak claims to keep off the site

- "Microwaving destroys nutrients": unsupported; losses follow water, time and temperature (Ioku 2001; Rungapamestry's broccoli shows the cost is in long cooking, not the oven type). **[moderate]**
- "Raw is always healthier": false for carotenoids and lycopene (sections 3.3) and for protein digestibility (part 1 section 5).
- "Cooking always destroys antioxidants": Palermo 2014 and Miglio 2008 (part 1) show it can raise measurable antioxidant capacity.
- "Blending destroys fibre" / "smoothies spike blood sugar": not supported (part 1 section 7).
- "Allicin yield up 300-500%" and similar precise garlic claims found on supplier sites: no traceable source. **[unverified]**
- "Chop broccoli and wait exactly 40 minutes": no trial found.
- "Sprouted grains have more protein / are gluten free" and similar: not examined; do not state.

## 5. Proposal for Minced

### 5.1 What we could compute and show

**Scope: micronutrients and alcohol only, from raw-weight recipe lines, using USDA Release 6 true-retention factors.** Macros, fibre, sugars and sodium stay exactly as computed today.

How it would look on a recipe page (voice kept warm and plain):

- In the nutrition panel, vitamin C, folate, thiamin, riboflavin, B6, minerals and carotenoids carry a small "estimated" mark. A one-line footnote: *"Vitamins and minerals are adjusted for typical cooking losses, using USDA averages. Real kitchens vary, so treat these as good estimates."* A "How we worked this out" link lists, per nutrient, the ingredient, method and factor used.
- Show whole-number precision only (factors are rounded to 5%).
- If an ingredient has no usable factor or an unclear method, its raw value is used and the panel says how many ingredients were adjusted ("adjusted for 4 of 6 cooked ingredients"). An honest gap, never a guessed factor.
- Vitamins D, E, K and anything outside the 26 nutrients: shown unadjusted and described as such in the same footnote.

Rules that keep it safe:

1. Precedence from 2.5 (analysed cooked food, then factor, then raw). Never stack.
2. One clear verb per ingredient or nothing. If a step sequence is ambiguous (boil then saute), use a combined code only when the table has one (it has a few, such as boiled+baked, boiled+fried for legumes); otherwise no adjustment.
3. **Microwave has no code.** Options: no adjustment (default), or use "steamed" as an explicit, disclosed proxy after owner approval. I recommend no adjustment until someone decides.
4. "Reheated" codes are never applied automatically (leftovers happen outside the recipe).
5. The stated numbers never imply measurement. Ranges are not shown because the dataset has no uncertainty, only a rounding step.
6. Validation before anything goes live: pick ~30 ingredient-method pairs where SR Legacy has both a raw and an analysed cooked food (for example broccoli, spinach, carrots, potatoes, green beans, lentils, brown rice, pasta), compute raw x factor on the same raw weight, and compare with the analysed cooked value after correcting for yield. Accept the approach only if most land within about 15% for vitamin C, folate and thiamin, and publish the misses. **I did not run this check; it is the first task for whoever builds it.**

### 5.2 What should only be a short note

Short, hedged, linkable to a source, shown on the relevant recipe step or ingredient (data, not strings in components; see 5.4). Draft wording, subject to the owner's voice edits:

- Garlic: *"Crush the garlic and let it sit about ten minutes before it hits the heat. It's an old cook's habit that research suggests helps keep garlic's sulfur compounds."*
- Broccoli and other cruciferous vegetables: *"Lightly cooked broccoli keeps more of the compound that makes it special than a long boil. A little mustard on cooked broccoli helps too."*
- Tomatoes: *"A splash of olive oil makes the tomato's colourful carotenoids easier for the body to take in."*
- Carrots, leafy greens and other carotenoid foods eaten with a salad: *"Add a little healthy fat, such as olive oil or avocado, and your body absorbs more of the carotenoids."*
- Boiled vegetables, beans and pasta: *"Using the cooking liquid in the dish keeps more of the vitamins that dissolve into the water."*
- Rice and potatoes: *"Cooling then reheating gives a little more resistant starch."*
- Pan-frying and pasta water: *"Some of the oil (or salt) stays in the pan or the water, so the numbers here may run slightly high."*
- Dried kidney beans: *"Boil kidney beans hard for at least ten minutes (thirty to be safe) before simmering; never in a slow cooker from raw."* (A safety note, shown prominently.)
- Roasting/frying starchy foods: *"Golden is lovely; very dark brown adds nothing."* (acrylamide, no numbers).

None says "healthier", "cures", "boosts immunity" or anything about disease.

### 5.3 What we should not claim

- Any change to calories, protein, carbohydrate, fat, fibre or sodium from chopping, blending, soaking, sprouting or fermenting.
- Glycaemic index or "blood sugar friendly", for pasta, blended fruit, cooled rice or anything else.
- Allicin, sulforaphane, glucosinolate, polyphenol or quercetin amounts. No USDA values, and the effects depend on timing and temperature.
- That one cooking method is "best", "healthiest" or "destroys" nutrients. Describe direction and cause, not verdicts.
- B12, protein or iron content of fermented or sprouted plant foods.
- A "preparation health score" for a dish.
- Any figure for a food state we hold no source for (sprouts, fermented veg).

### 5.4 Schema and pipeline sketch for the computable part

Sketch only; names are proposals. Any real migration follows the project rules (new files, RLS on, non-superuser safe, regenerate types).

```
nutrient_retention_factors                -- reference data, CC0, loaded once from retn06.txt
  retn_code        text      -- '3005'
  fd_grp_code      text      -- '11' (food group)
  description      text      -- 'VEG,GREENS,BOILED,WATER COVER DRAIN'
  nutrient_id      int  -> nutrients(id)   -- map USDA Nutr_No to our nutrients
  factor_pct       smallint  -- 0..100, true retention, nearest 5
  source           text      -- 'USDA Retention Factors Release 6 (2007), CC0'
  primary key (retn_code, nutrient_id)
  -- blanks in the file (24 rows) are skipped, never stored as 0

cook_method_retention                     -- the human-curated bridge (small, reviewable)
  ingredient_class text      -- 'greens' | 'other_veg' | 'roots' | 'potato' | 'tomato' | 'legume' | 'pasta' | 'rice' | 'beef' ...
  cook_method      text      -- 'boil_drain' | 'boil_liquid_kept' | 'steam' | 'stir_fry' | 'bake' | 'fry' ...
  retn_code        text -> nutrient_retention_factors
  -- one row per (class, method); anything absent means "no adjustment"

ingredients.retention_class text null     -- which USDA class an ingredient belongs to (via families)
recipe_ingredient_prep                    -- NOT columns on the hot recipe_ingredients table
  recipe_ingredient_id, cook_method, liquid_retained boolean, source ('parser'|'reviewed'), reviewed_by

recipe_nutrients: add  basis ('raw'|'retention_adjusted'), adjusted_ingredient_count, ingredient_count
```

Compute: inside the existing `refresh_recipe_nutrients()`, for each ingredient with a reviewed `cook_method` and a `retention_class`, multiply that ingredient's contribution for the nutrients that have a factor by `factor_pct / 100`; leave all other nutrients untouched. Store the adjusted value in `recipe_nutrients` with the counts above so the UI can say "adjusted for N of M". Because the cache is regenerable, the raw-based result stays reproducible by disabling the join.

Detection (offline, in the existing Python parser stage, results stored as data):

1. Tokenise each step, find cooking verbs from a small closed list (boil, simmer, steam, stir-fry, saute, roast, bake, fry, microwave, poach, braise, grill).
2. Link a verb to an ingredient only when that ingredient is named in the same step, or is the sole ingredient in play. Flag "drain" / "reserve the liquid" / "add the stock" for the liquid-retained decision, and soup/stew/braise/sauce recipe types default to liquid kept (as part 1 proposed).
3. Everything the script is unsure about goes to the **existing admin review queue** (`/admin/review`); only reviewed rows adjust numbers.
4. Measure coverage first on the snapshot copy: how many of the 957 recipes have at least one unambiguous ingredient-method pair. I did not measure this. If coverage is low, the feature is small and a notes-only release is the right size.

### 5.5 Effort and risk, honestly

- Smallest valuable release: **notes only** (5.2), plus the review of kidney bean steps. Low risk, no schema.
- Middle release: factors for the 3-4 highest-impact classes (boiled-and-drained vegetables, greens, potatoes, legumes, pasta and rice) and alcohol. Moderate; needs the validation step.
- Full release: all classes plus user recipes (user steps are free text of unknown quality; default to raw values for user recipes unless the user picks a method per ingredient).
- Biggest risk is false precision: a 5-point rounded average presented as a measured amount. The wording, the "adjusted for N of M" count and the validation report are the controls.

## 6. Decisions needed from the owner

| # | Decision | My recommendation |
|---|---|---|
| O1 | Do we adjust vitamins and minerals for cooking at all, or notes only? Boiled-and-drained vegetables lose roughly 15-45% of vitamin C and folate per the table (raw-based numbers overstate what reaches the plate), but adjusted numbers are averages too | Adjust, clearly marked as estimated, after the validation check passes; ship notes first either way |
| O2 | Default display: adjusted values, raw values, or a toggle on the Me/recipe panel | Adjusted by default with the footnote; "show raw values" link |
| O3 | Does Minced count ethanol energy today? If yes, apply alcohol retention first (cleanest case) | Check the snapshot; if counted, include |
| O4 | Microwave: no adjustment, or use "steamed" as a disclosed proxy | No adjustment |
| O5 | Ingredient classes: who approves the mapping of our ingredients to greens / other veg / roots (about 100-150 vegetable and legume ingredients) | One review pass in the admin queue |
| O6 | Where notes live: recipe pages, a "kitchen science" page, or both | Step-level or ingredient-level hint plus one page that explains the sources |
| O7 | Disclaimer wording | "General food-science information, not medical advice." in the existing warm voice |
| O8 | User recipes: apply methods automatically? | No; raw values unless the user picks a method |
| O9 | Safety copy for kidney beans and a scan of existing steps | Yes, independent of this feature |
| O10 | Adding new ingredients with cooked/sprouted/fermented analysed foods (the owner's other request): which to prioritise | Cooked forms of the top legumes, grains, greens and potatoes first, since they let us skip factors entirely (2.5) |

## 7. Source list

Primary or government (opened this session):

- USDA ARS, Table of Nutrient Retention Factors, Release 6 (2007), documentation PDF and data file: https://www.ars.usda.gov/Services/docs.htm?docid=9448 (files `retn06.pdf`, `retn06.txt`). Licence record (CC0 1.0): https://catalog.data.gov/dataset/usda-table-of-nutrient-retention-factors-release-6-2007
- Murphy, Criner & Gray 1975, *J Agric Food Chem* 23:1153-1157 (true vs apparent retention; cited by USDA, not opened).
- Augustin et al. 1992, *J Am Diet Assoc* 92:486-488 (alcohol retention; cited by USDA, values taken from the file).
- Song & Milner 2001, *J Nutr* 131:1054S: https://pubmed.ncbi.nlm.nih.gov/11238815/
- Rock et al. 1998, *J Nutr* 128:913: https://pubmed.ncbi.nlm.nih.gov/9567003/
- Rungapamestry et al. 2007, *Br J Nutr* 97:644: https://pubmed.ncbi.nlm.nih.gov/17349076/
- Unlu et al. 2005, *J Nutr* 135:431: https://pubmed.ncbi.nlm.nih.gov/15735074/
- Unlu et al. 2007, *Br J Nutr* 98:140: https://pubmed.ncbi.nlm.nih.gov/17391568/
- Palermo, Pellegrini & Fogliano 2014, *J Sci Food Agric* 94:1057: https://pubmed.ncbi.nlm.nih.gov/24227349/
- Nugrahedi et al. 2015, *Crit Rev Food Sci Nutr* 55:823: https://pubmed.ncbi.nlm.nih.gov/24915330/
- Raatz et al. 2016, *Food Chem* 208:297: https://pubmed.ncbi.nlm.nih.gov/27132853/
- Shohag, Wei & Yang 2012, *J Agric Food Chem* 60:9137: https://pubmed.ncbi.nlm.nih.gov/22906127/
- Ioku et al. 2001, *J Nutr Sci Vitaminol* 47:78: https://pubmed.ncbi.nlm.nih.gov/11349895/
- Gebauer et al. 2016, *Food Funct* 7:4231: https://pubmed.ncbi.nlm.nih.gov/27713968/

Seen through secondary coverage only (verify before quoting):

- Okunade et al. 2018, *Mol Nutr Food Res*: https://pubmed.ncbi.nlm.nih.gov/29806738/
- EFSA CONTAM Panel 2015, Scientific Opinion on acrylamide in food, *EFSA Journal* 13(6):4104: https://efsa.europa.eu/en/efsajournal/pub/4104
- Rickman, Barrett & Bruhn 2007, *J Sci Food Agric* 87:930 (industry-commissioned).
- SACN, Carbohydrates and Health (2015), free-sugars treatment of blended fruit; WHO 2015 sugars guideline not opened.
- FDA Bad Bug Book entry on kidney bean lectin (not opened; guidance seen via K-State and Food Safety News).
- Thompson et al. 2020, *Plant Foods Hum Nutr* (fermented cauliflower and white beans): https://pubmed.ncbi.nlm.nih.gov/32144644/ (title only).
- A Polish fresh-cut tomato and cucumber vitamin C study and a Brazilian restaurant vitamin C study (citations not confirmed).
- A 2022 in-vitro durum spaghetti digestion study (*Foods* 11:3650, found via search).
