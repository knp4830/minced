-- Recipe photos (wave 1, lane "photos").
--
-- One row per recipe photo, with the licence evidence beside it. Photos live in
-- Supabase Storage (bucket `recipe-photos`); this table is the index of what is
-- there and the attribution we owe for it.
--
-- WHY A TABLE AND NOT recipes.image_url
-- recipes.image_url holds hot-links to myplate-prod.azureedge.us, a host that
-- died with myplate.gov in January 2026 -- every one of those URLs 404s. A
-- single text column also has nowhere to put an author, a licence, or a link to
-- the file page, and CC BY / CC BY-SA *require* those. Keeping the licence in
-- the same row as the file makes "show the photo without its credit" a bug in
-- one place rather than a convention in many.
--
-- A recipe with no row here has no photo; the UI shows the colour-block
-- placeholder from design/Minced.dc.html. That is a valid state, not an error.
--
-- RLS follows the other recipe child tables (recipe_steps etc.): readable
-- exactly when the parent recipe is readable. There is deliberately NO write
-- policy -- nobody can insert, update or delete through the API. Photos are
-- loaded server-side with the secret key (which bypasses RLS) by
-- scripts/photos/apply_manifest.py's generated SQL. Omitting a policy is the
-- deny. Nothing in this migration weakens an existing policy.

create table recipe_photos (
  recipe_id        uuid primary key references recipes (id) on delete cascade,

  -- Object paths inside the `recipe-photos` bucket, e.g. 'usda/corn-bread/md.webp'.
  -- The public URL is derived by the app from NEXT_PUBLIC_SUPABASE_URL; storing
  -- full URLs would hard-code the project ref into every row.
  storage_path     text not null,
  thumb_path       text,

  -- Dimensions of the file at storage_path. Lets the UI reserve space (no
  -- layout shift) and pick object-fit without downloading the image first.
  width            integer not null check (width  > 0),
  height           integer not null check (height > 0),
  alt_text         text,

  source           text not null
                   check (source in ('usda_myplate', 'wikimedia_commons')),
  -- Closed list: adding a licence is a deliberate migration, not a data entry.
  license          text not null
                   check (license in ('Public domain', 'CC0') or license ~ '^CC BY(-SA)? [0-9.]+$'),
  license_url      text,
  -- Who to credit. Required for the CC licences; public-domain US government
  -- work is credited to the agency.
  credit           text,
  -- The page proving the above: Commons file page, or the archived MyPlate page.
  attribution_url  text not null,
  -- Where the bytes came from (Wayback URL / Commons file URL), kept for audit.
  source_image_url text,

  created_at       timestamptz not null default now(),

  -- A CC BY / CC BY-SA photo without an author and a licence link cannot be
  -- legally displayed. Make the database refuse the row instead of trusting
  -- every future importer to remember.
  constraint recipe_photos_cc_needs_credit
    check (license in ('Public domain', 'CC0') or (credit is not null and license_url is not null))
);

comment on table recipe_photos is
  'One photo per recipe plus the licence/attribution evidence. No client writes: loaded with the secret key.';

alter table recipe_photos enable row level security;

create policy "photos follow recipe visibility" on recipe_photos
  for select using (can_read_recipe(recipe_id));
