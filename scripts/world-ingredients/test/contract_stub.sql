-- TEST FIXTURE ONLY (not a migration, never applied to live). The wave 10 schema lane owns the real migration that creates
-- these tables; this stub follows the shared data contract so the WORLD lane's seeds can be exercised on a throwaway
-- snapshot database before the schema lane's branch is integrated. If the real column names differ, adjust emit_sql.py.
create table if not exists nutrients (
  id smallint primary key,
  key text not null unique,
  name text not null,
  unit text not null,
  fdc_number text,
  fdc_nutrient_id integer unique,
  dv_amount numeric,
  dv_unit text,
  display_group text,
  sort smallint
);
create table if not exists usda_foods (
  fdc_id integer primary key,
  description text not null,
  data_type text not null check (data_type in ('foundation','sr_legacy','fndds','branded')),
  brand_owner text,
  brand_name text,
  serving_size numeric,
  serving_size_unit text,
  household_serving text,
  publication_date date,
  cached_at timestamptz not null default now()
);
create table if not exists usda_food_nutrients (
  fdc_id integer not null references usda_foods (fdc_id) on delete cascade,
  nutrient_id smallint not null references nutrients (id),
  amount_per_100g numeric not null,
  primary key (fdc_id, nutrient_id)
);
create table if not exists ingredient_foods (
  ingredient_id integer not null references ingredients (id) on delete cascade,
  form text not null default 'default',
  fdc_id integer not null references usda_foods (fdc_id),
  is_default boolean not null default false,
  primary key (ingredient_id, form, fdc_id)
);
create unique index if not exists ingredient_foods_one_default on ingredient_foods (ingredient_id, form) where is_default;
create table if not exists ingredient_portions (
  id integer generated always as identity primary key,
  ingredient_id integer not null references ingredients (id) on delete cascade,
  unit_id integer references units (id),
  grams_per_unit numeric not null check (grams_per_unit > 0),
  source text not null check (source in ('usda','curated','us_can_size','label')),
  note text
);
create unique index if not exists ingredient_portions_unit on ingredient_portions (ingredient_id, coalesce(unit_id, 0));

insert into nutrients (id, key, name, unit, fdc_number, fdc_nutrient_id, dv_amount, dv_unit, display_group, sort) values
 (1,'calories','Calories','kcal','208',1008,2000,'kcal','energy',1),
 (2,'protein_g','Protein','g','203',1003,50,'g','macro',2),
 (3,'fat_g','Total fat','g','204',1004,78,'g','macro',3),
 (4,'sat_fat_g','Saturated fat','g','606',1258,20,'g','macro',4),
 (5,'cholesterol_mg','Cholesterol','mg','601',1253,300,'mg','macro',5),
 (6,'carbs_g','Carbohydrate','g','205',1005,275,'g','macro',6),
 (7,'fiber_g','Fiber','g','291',1079,28,'g','macro',7),
 (8,'sugars_g','Total sugars','g','269',2000,null,'g','macro',8),
 (9,'added_sugars_g','Added sugars','g','539',1235,50,'g','macro',9),
 (10,'sodium_mg','Sodium','mg','307',1093,2300,'mg','mineral',10),
 (11,'calcium_mg','Calcium','mg','301',1087,1300,'mg','mineral',11),
 (12,'iron_mg','Iron','mg','303',1089,18,'mg','mineral',12),
 (13,'magnesium_mg','Magnesium','mg','304',1090,420,'mg','mineral',13),
 (14,'potassium_mg','Potassium','mg','306',1092,4700,'mg','mineral',14),
 (15,'zinc_mg','Zinc','mg','309',1095,11,'mg','mineral',15),
 (16,'vitamin_a_mcg','Vitamin A (RAE)','mcg','320',1106,900,'mcg','vitamin',16),
 (17,'vitamin_c_mg','Vitamin C','mg','401',1162,90,'mg','vitamin',17),
 (18,'vitamin_d_mcg','Vitamin D','mcg','328',1114,20,'mcg','vitamin',18),
 (19,'vitamin_e_mg','Vitamin E','mg','323',1109,15,'mg','vitamin',19),
 (20,'vitamin_k_mcg','Vitamin K','mcg','430',1185,120,'mcg','vitamin',20),
 (21,'vitamin_b6_mg','Vitamin B6','mg','415',1175,1.7,'mg','vitamin',21),
 (22,'vitamin_b12_mcg','Vitamin B12','mcg','418',1178,2.4,'mcg','vitamin',22),
 (23,'folate_mcg','Folate (DFE)','mcg','435',1190,400,'mcg','vitamin',23)
on conflict do nothing;
