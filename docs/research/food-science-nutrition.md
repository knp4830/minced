# How preparation changes nutrition: research brief for Minced

**Research notes, not medical or dietary advice.** Prepared 2026-10-13 for the owner. Nothing here changes code.

## How much to trust this brief

- Citations come from web search. I read **abstracts, registry pages or secondary summaries**, not every full text. Each claim carries a confidence tag:
  - **[strong]** a government resource, or many concordant studies.
  - **[moderate]** a good primary study or review, small or narrow.
  - **[weak]** one small study, or only secondary coverage seen.
- Several exact numbers could not be confirmed (flagged "verify"). Check the primary source before any figure reaches a user-facing screen.
- Details I could not reconcile: the Evenepoel 1998 egg figures (section 5), and participant counts in Gärtner 1997 and Brown 2004.

## Summary table

| Topic | What the evidence supports | Strength | Safe to auto-apply? |
|---|---|---|---|
| Vitamin C and B vitamins, boiling | Largest losses; water leaches them; steaming/microwave usually keeps more | strong (direction), moderate (numbers) | Yes, via USDA retention factors, micronutrients only |
| Fat-soluble nutrients (lycopene, carotenoids) | Cooking and fat raise absorption; no fat means little absorbed | moderate | Note only |
| Frying oil uptake | Real, large, very food-specific | strong (direction) | Not from the verb |
| Protein digestibility | Cooking improves digestibility of eggs and legumes | moderate | No (macro grams barely change) |
| Resistant starch from cooling rice/potato | Small rise in resistant starch; small drop in glucose response | moderate to weak | Note only |
| Blending vs whole fruit | Mixed; satiety lower for puree/juice, glucose effect unsettled | moderate | No |
| Juicing | Fibre largely removed; juice linked to higher diabetes risk in cohorts | moderate | Only as a fibre adjustment if a recipe says "juice and discard pulp" |
| Soaking/sprouting/fermenting | Phytate falls; mineral absorption can rise | moderate | Note only |
| Nuts: whole vs ground | Measured calories below Atwater values; depends on form | moderate | No |

## 1. USDA retention factors (the backbone)

- **USDA Table of Nutrient Retention Factors, Release 6 (2007)**, USDA ARS Nutrient Data Laboratory. Factors for vitamins, minerals and alcohol (the ARS page says 26 components; choline was added in this release) across roughly 290 foods and many preparation methods. It replaced Release 5 (2003). **[strong]**
  - ARS page: https://www.ars.usda.gov/Services/docs.htm?docid=9448 (PDF 124 KB plus a text data file 545 KB).
  - CSV copy: https://agdatacommons.nal.usda.gov/articles/dataset/USDA_Table_of_Nutrient_Retention_Factors_Release_6_2007_/24660888/1
  - USDA publications are generally public domain, but the ARS page states no licence. Confirm before bulk import, as the project's licence rule demands.
- Purpose: estimate the nutrient content of a cooked food from the raw one when no cooked-food analysis exists. That is exactly Minced's situation.
- Check in the PDF (the page did not say): the retention definition (true retention accounts for weight change; apparent retention does not), and the food-group codes used to map to an ingredient.
- Limitation: factors are per food group and method (for example "vegetables, boiled, drained"), averaged over studies of varied quality. Good for averages, not for a specific dish.

## 2. Cooking losses of water-soluble vitamins

- Vitamin C and the B vitamins dissolve in cooking water and degrade with heat and time. Loss depends on **how much water is discarded**, time, and cut size.
- Broccoli vitamin C, from several small studies (percentages differ by protocol; verify before quoting): boiling lost about 34% (Galgano et al. 2007) and about 55% (Zeng 2013); steaming about 14% to 22%; microwaving about 28% in Zeng, with other work finding microwave and steam similar. Boiling ranked worst or near worst in every study found. **[moderate]**
  - Zeng 2013, *Nutrition & Food Science*: https://www.emerald.com/insight/content/doi/10.1108/NFS-12-2012-0126/full/html
  - Galgano et al. 2007: https://iris.unibas.it/handle/11563/16026
- **Cooking is not uniformly harmful.** Miglio et al. 2008 (*J Agric Food Chem* 56:139-147, doi 10.1021/jf072304b) cooked carrots, courgettes and broccoli by boiling, steaming and frying. Water-based cooking kept carotenoids better, and measured antioxidant capacity **rose** after cooking, probably because softening releases compounds from the plant matrix. **[moderate]** https://scinapse.io/papers/2055253969
- Rule of thumb the evidence supports: loss rises with water volume, time and temperature; it falls with whole pieces, steaming, short cooking and **using the cooking liquid**. Soups and stews lose little because the liquid is eaten.

## 3. Fat-soluble nutrients: cooking and fat can increase availability

- **Lycopene**: Gärtner, Stahl & Sies 1997, *Am J Clin Nutr* 66:116-122. Heat-processed tomato paste gave about 2.5 times the peak and 3.8 times the AUC of blood lycopene compared with fresh tomatoes, at the same lycopene dose with oil. Small crossover study. **[moderate]** https://pubmed.ncbi.nlm.nih.gov/9209178/
- **Carotenoids need fat**: Brown et al. 2004, *Am J Clin Nutr* 80:396-403. Seven people ate salads with 0, 6 or 28 g canola oil; with fat-free dressing carotenoid absorption was negligible and rose with fat. Tiny sample. **[moderate]** Follow-up summary: https://www.purdue.edu/newsroom/releases/2012/Q2/study-no-fat%2C-low-fat-dressings-dont-get-most-nutrients-out-of-salads.html
- Implication: the direction is clear (cooked plus fat beats raw without fat), the size is not something to print as a number. Minced stores none of these nutrients today.

## 4. Frying and oil uptake

- Fillion & Henry 1998, *Int J Food Sci Nutr* 49:157-168: frying changes protein and minerals little, vitamin C in French fries stays close to raw potato, some unsaturated fats and antioxidants are lost to oxidation, and **fat uptake raises energy density**. **[moderate]** https://pubmed.ncbi.nlm.nih.gov/9713586/
- Oil uptake is largely a surface phenomenon, and much of the oil enters as food **cools after leaving the fryer** (Touffet, Trystram & Vitrac, via https://hal.archives-ouvertes.fr/hal-02867353). It varies with surface area, coating, temperature and draining. **[moderate]**
- Implication: "fry" in a step says nothing reliable about oil eaten. When a recipe lists oil for pan-frying, the current calorie sum counts all of it, which probably **overcounts** when oil stays in the pan. Record this as a known direction of error; do not correct it from the verb.

## 5. Protein digestibility

- Evenepoel et al. 1998, *J Nutr* 128:1716-1722: cooked egg protein digested far better than raw (reported about 91% vs 51%; secondary sources disagree and the group's 1999 paper reports different malabsorption numbers, so **verify before quoting**). Small study. **[moderate for direction, weak for numbers]**
- Legume and soy proteins also become more digestible with heat because protease inhibitors are inactivated (standard food-science result; no primary citation pulled, add one if used).
- Implication: label protein grams are chemical measures and ignore digestibility. Most egg, meat and fish dishes are cooked anyway. Do not adjust protein.

## 6. Resistant starch from cooling cooked rice and potatoes

- Sonia et al. 2015, *Asia Pac J Clin Nutr* 24:620-625: resistant starch in white rice rose from about 0.64 g/100 g fresh to about 1.65 g/100 g after 24 h at 4 C then reheating; in 15 healthy adults the glucose response was lower (125 vs 152 mmol-min/L, p=0.047). **[moderate]** https://pubmed.ncbi.nlm.nih.gov/26693746/
- Other small crossovers (Dhar et al. 2021, 20 people) point the same way. Potato data (Larder et al. 2018) were seen only second-hand; **verify**. **[weak]**
- Implication: the absolute amount is small (about 1 g per 100 g). No fibre or energy adjustment is justified; at most a note on recipes that say "chill".

## 7. Blending, juicing and the structure of fruit

- **Satiety**: Flood-Obbagy & Rolls 2009, *Appetite* 52:416-422. 58 adults; preloads matched for weight, energy and eating rate. Fullness ranked whole apple > applesauce > juices. Whole apple cut lunch intake about 15%, and lunch intake was 91 kcal lower than after applesauce and 178 kcal lower than after juice. Added fibre did not help juice. **[moderate]** https://pubmed.ncbi.nlm.nih.gov/19110020/
- **Glycaemic response, blended vs whole**: Crummett & Grosso 2022, *Nutrients* 14:4565. 20 healthy students, apple plus blackberries; the **blended** version gave a lower peak glucose and iAUC, the opposite of the common assumption. Single acute test, two fruits, water base; authors warn against extrapolating to commercial smoothies. Another source (via review) found mango no different and mixed fruit lower when blended. **[weak to moderate; direction unsettled]** https://pmc.ncbi.nlm.nih.gov/articles/PMC9657402
- **Juice and long-term outcomes**: Muraki et al. 2013, *BMJ* 347:f5001. In three US cohorts, several whole fruits (blueberries, grapes, apples) were associated with lower type 2 diabetes risk and juice with higher risk. **Observational**, food-frequency data; the fibre explanation is a hypothesis. **[moderate]** https://www.bmj.com/content/347/bmj.f5001.full
- Juicing removes fibre by simple arithmetic (pulp discarded). Blending keeps fibre but shreds structure; the sources found do not support "blending destroys fibre". What changes is physical form, which may affect fullness and eating speed.
- **Nuts show the same principle**: Novotny et al. 2012, *Am J Clin Nutr* (PMC3396444): measured energy of whole almonds was about 129 kcal per 28 g, roughly 20% below the Atwater value (Atwater overestimated by 32%). A 2016 follow-up found form (whole, roasted, chopped, butter) affects absorbed energy. **[moderate]** https://pmc.ncbi.nlm.nih.gov/articles/PMC3396444

Summary: food structure affects fullness and how fast sugar arrives, but short-trial effects are modest and sometimes reversed. There is no defensible numeric correction to calories or carbohydrate for "blend".

## 8. Soaking, sprouting, fermentation and phytate

- Phytate binds iron, zinc and calcium. Soaking, germination and fermentation activate phytase: soaking cut phytic acid 4% to 51% depending on crop and conditions; fermentation with soaking and germination up to about 85% in one maize study (Nsabimana et al. 2024, https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11646714/). Gibson, Perlas & Hotz 2006 (*Proc Nutr Soc*) review reports better iron, zinc and calcium absorption from dephytinised cereals. **[moderate]**
- Implication: this changes absorption, not the mineral content on paper. Note only.

## 9. Design: preparation-aware nutrition in Minced

### What Minced stores today
Six per-serving values on `recipes` (calories, protein, carbs, fat, sodium, fibre; see `docs/SCHEMA-NOTES.md`). Most preparation effects here concern **micronutrients and absorption**, which are not stored. The macros mostly do not move with cooking, apart from water loss (concentration, not totals) and fat added or absorbed.

### Tier A: apply automatically (evidence strong enough)
1. **Micronutrient retention, if and when micronutrients are added** (vitamin C, folate, thiamin, riboflavin, B6 and a few more), using USDA retention factors per food group and method. This is the only place a government dataset directly supports a computed adjustment.
2. Nothing else. Macros, fibre and sodium stay as computed from raw ingredients, because no source here supports a reliable verb-to-gram correction.

### Tier B: show as a note only (directional, not quantitative)
- Cook tomatoes with a little oil: lycopene and carotenoids absorb better (section 3).
- Steaming, or using the cooking liquid, keeps more vitamin C and B vitamins (section 2).
- Chilled then reheated rice has slightly more resistant starch (section 6).
- Soaking or fermenting grains and beans lowers phytate (section 8).
- Whole fruit tends to be more filling than puree or juice (section 7).
- Pan-fried: some oil stays in the pan, so the calorie figure may run high (section 4).

Wording: "tends to", with the source linked; never imply a health outcome.

### Tier C: do not do
- No glycaemic claims for blended fruit (unsettled).
- No protein-quality or digestibility adjustments.
- No per-dish "healthiness" score derived from methods.

### Detecting the method
- Steps are free text. Map a short verb list to methods: boil/simmer/poach -> boiled; steam; microwave; fry/saute/sear/stir-fry -> pan-fried; deep-fry; roast/bake/broil/grill; blend/puree; none -> raw. Extract at import time in the existing offline Python parser stage and store as data, not recomputed on read.
- Ambiguity is the main risk (boil then saute the same ingredient; soups keep the liquid). Rule: assign a method to an ingredient only when exactly one cooking verb in the steps refers to it; otherwise no adjustment and no note (conservative default = raw values).
- Liquid-retained flag: if cooking water becomes part of the dish (soup, stew, braise, sauce), skip the leaching loss.

### Data needed
1. USDA Retention Factors Release 6 loaded as a reference table: food group, method, nutrient, retention percent, source row id. Import under the same "public data, licence confirmed" gate as other sources.
2. A mapping from Minced canonical ingredients to the table's food groups (the ingredient families table is a start).
3. `recipe_ingredients.cook_method` (nullable enum) and a `liquid_retained` flag, filled at import and reviewable in the existing review queue.
4. Micronutrient base values per ingredient from USDA FoodData Central (the nutrition pipeline already reads FDC), stored per serving, only if the owner puts micronutrients in scope.
5. Optional: a small curated notes table (tier B text, ingredient families affected, source URL) so notes are data, not strings in components.

### Open decisions for the owner
- Are micronutrients in scope? Without them tier A has nothing to adjust and the feature reduces to notes.
- Notes on recipe pages versus a separate "kitchen science" page.
- Disclaimer wording (suggest: "General food-science information, not medical advice").
- Whether to correct oil overcounting for pan-frying (needs a measured-oil convention, not a verb rule).

## Source list
- USDA ARS, Table of Nutrient Retention Factors Release 6: https://www.ars.usda.gov/Services/docs.htm?docid=9448
- Gärtner, Stahl, Sies 1997: https://pubmed.ncbi.nlm.nih.gov/9209178/
- Brown et al. 2004, Am J Clin Nutr 80:396-403 (seen via trade and Purdue summaries)
- Miglio et al. 2008, J Agric Food Chem 56:139-147
- Zeng 2013 and Galgano 2007 (broccoli): links in section 2
- Fillion & Henry 1998: https://pubmed.ncbi.nlm.nih.gov/9713586/
- Evenepoel et al. 1998, J Nutr 128:1716-1722
- Sonia et al. 2015: https://pubmed.ncbi.nlm.nih.gov/26693746/
- Flood-Obbagy & Rolls 2009: https://pubmed.ncbi.nlm.nih.gov/19110020/
- Crummett & Grosso 2022: https://pmc.ncbi.nlm.nih.gov/articles/PMC9657402
- Muraki et al. 2013: https://www.bmj.com/content/347/bmj.f5001.full
- Novotny et al. 2012: https://pmc.ncbi.nlm.nih.gov/articles/PMC3396444
- Gibson, Perlas, Hotz 2006; Nsabimana et al. 2024: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11646714/
