# Licences of the national food-composition tables (wave 10c)

Checked on 2026-10-17. Both tables are imported ONCE into our tables (`usda_foods` with `data_type` `cofid` / `cnf`, nutrients per 100 g in our keys),
only for the foods an ingredient links to. There are no runtime calls to either publisher. Raw downloads live in the gitignored `cache/`.

## UK: McCance and Widdowson's Composition of Foods Integrated Dataset (CoFID) 2021

* Publisher: Public Health England (since 2021 the UK Health Security Agency / OHID). Published 2021-03-19 as "Composition of foods integrated dataset (CoFID)".
* File used: `McCance_Widdowsons_Composition_of_Foods_Integrated_Dataset_2021..xlsx` from
  https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid
* Licence statement on that page (footer, no exception stated for this publication):
  > "All content is available under the Open Government Licence v3.0, except where otherwise stated"
* The user guide PDF of the dataset ends: "Published: March 2021 ... © Crown copyright 2021" (Crown copyright information is what the OGL covers).
* Licence text, https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ :
  > "You are free to: copy, publish, distribute and transmit the Information; adapt the Information; exploit the Information commercially and non-commercially for example, by combining it with other Information, or by including it in your own product or application."
  > "You must (where you do any of the above): acknowledge the source of the Information in your product or application by including or linking to any attribution statement specified by the Information Provider(s) and, where possible, provide a link to this licence; If the Information Provider does not provide a specific attribution statement, you must use the following: Contains public sector information licensed under the Open Government Licence v3.0."
* The licence does not cover personal data, third-party rights the provider cannot license, or logos. The dataset contains none of these.
* Open question for the owner (low risk): the licence statement is the site-wide gov.uk one and the dataset itself carries only "(c) Crown copyright 2021". If you want written confirmation, email PHE.Enquiries@PHE.gov.uk (the address in the user guide).

Attribution text to show (static, on /about and under a label that uses one of these foods):

> Contains public sector information licensed under the Open Government Licence v3.0. UK foods: McCance and Widdowson's Composition of Foods Integrated Dataset 2021, Public Health England.

## Canada: Canadian Nutrient File (CNF) 2026

* Publisher: Health Canada. Dataset "Canadian Nutrient File, 2026" on the Open Government Portal:
  https://open.canada.ca/data/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109 (licence field: `ca-ogl-lgo`, "Open Government Licence - Canada").
* File used: `cnf_fcen_all-files-data_2026.zip` (resource `019f2a90-e3a9-489d-b6e1-f74f4ba1d006`).
* Licence text, https://open.canada.ca/en/open-government-licence-canada :
  > "The Information Provider grants you a worldwide, royalty-free, perpetual, non-exclusive licence to use the Information, including for commercial purposes, subject to the terms below."
  > "You are free to: Copy, modify, publish, translate, adapt, distribute or otherwise use the Information in any medium, mode or format for any lawful purpose."
  > "You must, where you do any of the above: Acknowledge the source of the Information by including any attribution statement specified by the Information Provider(s) and, where possible, provide a link to this licence. If the Information Provider does not provide a specific attribution statement ... you must use the following attribution statement: Contains information licensed under the Open Government Licence - Canada."
* Exemptions: personal information, third-party rights the provider is not authorised to license, official names, crests and logos. None apply to nutrient values.
* The older "CNF 2015" download page only says "Copyright Guidelines: Refer to Crown Copyright". That is why the 2026 dataset, whose catalogue entry names the OGL, is the one imported.

Attribution text to show (static):

> Contains information licensed under the Open Government Licence - Canada. Canadian foods: Canadian Nutrient File 2026, Health Canada.

## What is NOT used

Open Food Facts (ODbL), MyFitnessPal, Nutritionix, Edamam, scraped brand sites, and USDA-derived rows of CNF that duplicate SR Legacy (CNF foods with a USDA NDB code are used only where our USDA tables have no equivalent).
