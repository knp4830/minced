-- Wave 10c: foods from two national composition tables sit beside USDA FoodData Central in usda_foods.
--
--   cofid  UK McCance and Widdowson's Composition of Foods Integrated Dataset 2021 (Public Health England), Open Government Licence v3.0
--   cnf    Canadian Nutrient File 2026 (Health Canada), Open Government Licence - Canada
--
-- Why a new data_type rather than a new table: a "food" is one thing to everything downstream (ingredient_foods, recipe lines,
-- the compute, the label, the type-ahead). Only the source differs, and data_type already says which source.
--
-- fdc_id for these rows is NOT a FoodData Central id. It is a synthetic key in a range FDC will never reach (FDC ids are below
-- about 3 million today):  900,000,000 + CNF Food_Code  and  910,000,000 + group * 10,000 + item  for a CoFID code "GG-III".
-- source_code keeps the publisher's own code so a person can find the row in the original table. Nothing links an fdc_id of
-- these rows to fdc.nal.usda.gov: the UI must branch on data_type.
--
-- Both tables are published per 100 g. Conversions into our nutrient keys are documented in
-- scripts/nutrition/national/load_national.py (carbohydrate, vitamin A and fibre differ in definition between the UK and US).

alter table usda_foods drop constraint if exists usda_foods_data_type_check;
alter table usda_foods
  add constraint usda_foods_data_type_check
  check (data_type in ('foundation', 'sr_legacy', 'fndds', 'branded', 'cofid', 'cnf'));

alter table usda_foods add column if not exists source_code text;

comment on column usda_foods.source_code is
  'The publisher''s own code for a cofid or cnf food (CoFID "13-807", CNF Food_Code "4847"); null for USDA foods, whose key is fdc_id.';
