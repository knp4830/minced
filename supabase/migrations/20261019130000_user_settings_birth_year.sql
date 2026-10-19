-- Wave 10c: birth year on user_settings, so a person who gives only weight, sex and age gets a sedentary
-- baseline in Me (src/lib/me/dailyValues.ts baselineMacros) and the age-banded DRIs, without having to finish
-- the targets wizard.
--
-- A birth year, not an age: an age saved today is wrong next year. The app derives age = this year - birth year
-- (off by at most one year, which only matters at a DRI band edge). The database only bounds it to a sane range;
-- the app validates 13-120 years old (a check constraint cannot use the current year).
--
-- Private like the rest of the table: owner-only RLS already covers the new column. Non-superuser safe.

alter table public.user_settings
  add column birth_year smallint check (birth_year between 1900 and 2100);

comment on column public.user_settings.birth_year is
  'Optional. Used only for the Me calorie baseline and age-banded daily values. Never shown to anyone else.';
