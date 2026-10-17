-- Scratch database "fdc" (throwaway container only). Holds the compact FDC CSVs
-- so the curation scripts can query them with SQL. Never part of the product DB.
create table foods (fdc_id int primary key, data_type text, description text, category_id text, publication_date text);
create table branded (fdc_id int primary key, description text, publication_date text, brand_owner text, brand_name text,
  subbrand_name text, gtin text, serving_size numeric, serving_unit text, household text, category text, ingredients text);
create table nut (fdc_id int, nutrient_id int, amount numeric);
create table portions (fdc_id int, amount numeric, unit text, modifier text, descr text, grams numeric);
