-- Wave 5: two more photo sources, Openverse (openly licensed images found through api.openverse.org) and Pexels.
-- The source and licence lists are CLOSED on purpose (a new licence is a deliberate migration, not a data entry), so
-- widen them here. Plain DDL on a small table: no extension settings, no superuser-only statements.
--   source   : + 'openverse', 'pexels'
--   licence  : + 'Pexels License' (free to use, attribution appreciated; we always show the credit)
-- The recipe_photos_cc_needs_credit check is untouched: every licence except Public domain / CC0 still needs a credit
-- and a licence link, so a Pexels row without a photographer or link is refused by the database.

alter table recipe_photos drop constraint recipe_photos_source_check;
alter table recipe_photos add constraint recipe_photos_source_check
  check (source in ('usda_myplate', 'wikimedia_commons', 'openverse', 'pexels'));

alter table recipe_photos drop constraint recipe_photos_license_check;
alter table recipe_photos add constraint recipe_photos_license_check
  check (license in ('Public domain', 'CC0', 'Pexels License') or license ~ '^CC BY(-SA)? [0-9.]+$');
