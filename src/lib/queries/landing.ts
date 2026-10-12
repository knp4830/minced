import type { SupabaseClient } from "@supabase/supabase-js";

import { photoPublicUrl } from "@/lib/photos";
import { createStaticClient } from "@/lib/supabase/static";
import type { FilterOptions } from "@/lib/queries/browse";

/**
 * Data for the landing page and the photo credits list. Cookie-free client:
 * these pages are identical for every visitor and are cached.
 */

export type LandingPhoto = {
  slug: string;
  title: string;
  url: string;
  alt: string;
};

export type PhotoCredit = {
  slug: string;
  title: string;
  credit: string | null;
  license: string;
  licenseUrl: string | null;
  attributionUrl: string;
};

type PhotoRow = {
  storage_path: string;
  thumb_path: string | null;
  alt_text: string | null;
  width: number;
  height: number;
  recipes: { slug: string; title: string } | null;
};

/** Published recipes, exact. RLS already hides drafts from the anonymous key. */
export async function getRecipeCount(): Promise<number> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const { count, error } = await sb
    .from("recipes")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/**
 * How many filter groups /recipes offers: the four fixed ones (time, spice,
 * calories, protein) plus diet, free-of, cuisine and cookware when they have options.
 */
export function countFilterGroups(options: FilterOptions): number {
  return (
    4 +
    (options.diets.length > 0 ? 1 : 0) +
    (options.allergens.length > 0 ? 1 : 0) +
    (options.cuisines.length > 0 ? 1 : 0) +
    (options.cookware.length > 0 ? 1 : 0)
  );
}

// Words that name the *kind* of dish. Picking one photo per kind keeps the grid
// from becoming nine bowls of rice.
const DISH_WORDS = [
  "soup",
  "stew",
  "curry",
  "rice",
  "noodle",
  "salad",
  "chicken",
  "beef",
  "pork",
  "fish",
  "egg",
  "bean",
  "lentil",
  "tofu",
  "roll",
  "kebab",
  "pasta",
  "bowl",
  "pancake",
  "porridge",
];

function dishKinds(title: string): string[] {
  const t = title.toLowerCase();
  return DISH_WORDS.filter((w) => t.includes(w));
}

/**
 * Nine real photos for the hero grid. Squarish-or-landscape crops only (a
 * portrait photo cropped square loses the dish), then greedily spread across
 * dish kinds, walking the catalog at a fixed stride so the choice is stable.
 */
export async function getLandingPhotos(count = 9): Promise<LandingPhoto[]> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const { data, error } = await sb
    .from("recipe_photos")
    .select("storage_path, thumb_path, alt_text, width, height, recipes(slug, title)")
    .limit(500);
  if (error || !data) return [];

  const rows = (data as unknown as PhotoRow[])
    .filter((r) => {
      if (!r.recipes) return false;
      const ratio = r.width / r.height;
      return ratio >= 1 && ratio <= 1.6;
    })
    .sort((a, b) => a.recipes!.title.localeCompare(b.recipes!.title));
  if (rows.length === 0) return [];

  const stride = Math.max(1, Math.floor(rows.length / (count * 2)));
  const picked: PhotoRow[] = [];
  const seen = new Set<string>();
  for (let pass = 0; pass < 2 && picked.length < count; pass++) {
    for (let i = pass; i < rows.length && picked.length < count; i += stride) {
      const row = rows[i];
      if (picked.includes(row)) continue;
      const kinds = dishKinds(row.recipes!.title);
      if (pass === 0 && kinds.some((k) => seen.has(k))) continue;
      kinds.forEach((k) => seen.add(k));
      picked.push(row);
    }
  }

  return picked.map((r) => ({
    slug: r.recipes!.slug,
    title: r.recipes!.title,
    url: photoPublicUrl(r.thumb_path ?? r.storage_path),
    alt: r.alt_text ?? r.recipes!.title,
  }));
}

/** Every photo that carries a credit, for the /about credits list. */
export async function getPhotoCredits(): Promise<PhotoCredit[]> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const { data, error } = await sb
    .from("recipe_photos")
    .select("credit, license, license_url, attribution_url, recipes(slug, title)")
    .limit(2000);
  if (error || !data) return [];
  return (
    data as unknown as {
      credit: string | null;
      license: string;
      license_url: string | null;
      attribution_url: string;
      recipes: { slug: string; title: string } | null;
    }[]
  )
    .filter((r) => r.recipes)
    .map((r) => ({
      slug: r.recipes!.slug,
      title: r.recipes!.title,
      credit: r.credit,
      license: r.license,
      licenseUrl: r.license_url,
      attributionUrl: r.attribution_url,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
