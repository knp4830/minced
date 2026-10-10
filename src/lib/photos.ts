/**
 * Where recipe photos live and which URLs may be shown.
 *
 * Photos are files in the public Storage bucket `recipe-photos`, described by
 * rows in `recipe_photos` (path, licence, credit). The app derives the public
 * URL from NEXT_PUBLIC_SUPABASE_URL instead of storing it, so a project move
 * does not rewrite every row.
 */

const BUCKET = "recipe-photos";

export function photoPublicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}

/**
 * `recipes.image_url` was hot-linked to myplate-prod.azureedge.us, which no
 * longer resolves. Showing it paints a broken-image icon over the colour-block
 * placeholder, so a URL on a known-dead host counts as "no photo".
 */
const DEAD_HOSTS = ["myplate-prod.azureedge.us"];

export function usableImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return DEAD_HOSTS.includes(new URL(url).host) ? null : url;
  } catch {
    return null;
  }
}

/** CC BY / CC BY-SA require attribution; public domain and CC0 do not. */
export function needsAttribution(license: string): boolean {
  return license !== "Public domain" && license !== "CC0";
}
