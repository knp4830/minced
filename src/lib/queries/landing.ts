
import { needsAttribution, photoPublicUrl } from "@/lib/photos";
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
  const sb = createStaticClient();
  const { count, error } = await sb
    .from("recipes")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/**
 * How many filter groups /recipes offers: the four fixed ones (time, ingredients,
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
 * Slots 3-5 are the landing's feature tiles (about 360 x 380 CSS px, so 720+ px on a 2x screen) and slots 0
 * and 6-8 are larger tiles: they get the 1200 px `storage_path` file. The rest get the 640 px `thumb_path`.
 * Wave 8: the hero used the 400 px thumb in a 379 px tile, so on a retina screen it was stretched 2x.
 */
const LARGE_SLOTS = new Set([0, 3, 4, 5, 6, 7, 8]);

/**
 * The landing photos are curated, not sampled: every one was checked at full size (source at least 1920 px
 * on the long side, sharp, no clutter or brand text, and it really is the dish it is labelled as). Order
 * matters: 0 is the hero tile, 6 the big collage tile (both want a roughly square, centred subject).
 * scripts/photos/manifest/landing_curated.json is the human-readable record of why each was picked.
 */
const CURATED_SLUGS = [
  "japanese-curry-rice",
  "shakshuka",
  "som-tam",
  "okonomiyaki",
  "maafe",
  "oyakodon",
  "sopa-de-tortilla",
  "chickpea-dip",
  "tabbouleh",
] as const;

/** A fallback photo must have been stored at least this wide (md is capped at 1200), i.e. a source of 1000+ px. */
const FALLBACK_MIN_WIDTH = 1000;

function toLandingPhoto(r: PhotoRow, slot: number): LandingPhoto {
  const path = LARGE_SLOTS.has(slot) ? r.storage_path : (r.thumb_path ?? r.storage_path);
  return {
    slug: r.recipes!.slug,
    title: r.recipes!.title,
    url: photoPublicUrl(path),
    alt: r.alt_text ?? r.recipes!.title,
  };
}

/**
 * Nine real photos for the hero grid: the curated list above, in order. If a curated recipe has lost its
 * photo (or the list is short of `count`), the remainder is filled from the catalog: only photos stored at
 * least FALLBACK_MIN_WIDTH wide (never a small or upscaled one), squarish-or-landscape crops only (a
 * portrait photo cropped square loses the dish), spread across dish kinds, walking the catalog at a fixed
 * stride so the choice is stable.
 */
export async function getLandingPhotos(count = 9): Promise<LandingPhoto[]> {
  const sb = createStaticClient();

  const { data: curatedData } = await sb
    .from("recipe_photos")
    .select("storage_path, thumb_path, alt_text, width, height, recipes!inner(slug, title)")
    .in("recipes.slug", [...CURATED_SLUGS]);
  const bySlug = new Map(
    ((curatedData ?? []) as unknown as PhotoRow[]).filter((r) => r.recipes).map((r) => [r.recipes!.slug, r]),
  );
  const curated = CURATED_SLUGS.map((s) => bySlug.get(s)).filter((r): r is PhotoRow => Boolean(r));
  if (curated.length >= count) return curated.slice(0, count).map((r, i) => toLandingPhoto(r, i));

  const { data, error } = await sb
    .from("recipe_photos")
    .select("storage_path, thumb_path, alt_text, width, height, recipes(slug, title)")
    .order("recipe_id", { ascending: true })
    .limit(500);
  if (error || !data) return curated.map((r, i) => toLandingPhoto(r, i));

  const taken = new Set(curated.map((r) => r.recipes!.slug));
  const rows = (data as unknown as PhotoRow[])
    .filter((r) => {
      if (!r.recipes || taken.has(r.recipes.slug)) return false;
      if (r.width < FALLBACK_MIN_WIDTH) return false;
      const ratio = r.width / r.height;
      return ratio >= 1 && ratio <= 1.6;
    })
    .sort((a, b) => a.recipes!.title.localeCompare(b.recipes!.title));
  if (rows.length === 0) return curated.map((r, i) => toLandingPhoto(r, i));

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

  return [...curated, ...picked].slice(0, count).map((r, i) => toLandingPhoto(r, i));
}

export type HeroSlide = {
  slug: string;
  title: string;
  url: string;
  alt: string;
  totalTimeMin: number | null;
  calories: number;
  proteinG: number;
  /** "Name · CC BY-SA 4.0" when the licence requires attribution, else null. */
  credit: string | null;
};

/** The hero rotates through at most this many photos. */
const HERO_SLIDES = 5;

/**
 * The full-bleed hero: curated photos (checked at full size, see CURATED_SLUGS) whose recipes have COMPLETE
 * nutrition, because the caption states that recipe's calories and protein as fact. A partial recipe would
 * show an undercount, so it is skipped rather than labelled. Curated order is kept.
 */
export async function getHeroSlides(): Promise<HeroSlide[]> {
  const sb = createStaticClient();
  const { data, error } = await sb
    .from("recipe_photos")
    .select(
      "storage_path, alt_text, credit, license, recipes!inner(slug, title, total_time_min, calories, protein_g, nutrition_status)",
    )
    .in("recipes.slug", [...CURATED_SLUGS])
    .eq("recipes.nutrition_status", "complete");
  if (error || !data) return [];
  type Row = {
    storage_path: string;
    alt_text: string | null;
    credit: string | null;
    license: string;
    recipes: {
      slug: string;
      title: string;
      total_time_min: number | null;
      calories: number | null;
      protein_g: number | null;
    } | null;
  };
  const bySlug = new Map(
    (data as unknown as Row[])
      .filter((r) => r.recipes && r.recipes.calories != null && r.recipes.protein_g != null)
      .map((r) => [r.recipes!.slug, r]),
  );
  return CURATED_SLUGS.map((s) => bySlug.get(s))
    .filter((r): r is Row => Boolean(r))
    .slice(0, HERO_SLIDES)
    .map((r) => ({
      slug: r.recipes!.slug,
      title: r.recipes!.title,
      url: photoPublicUrl(r.storage_path),
      alt: r.alt_text ?? r.recipes!.title,
      totalTimeMin: r.recipes!.total_time_min,
      calories: Math.round(r.recipes!.calories!),
      proteinG: Math.round(r.recipes!.protein_g!),
      credit: needsAttribution(r.license) && r.credit ? `${r.credit} · ${r.license}` : null,
    }));
}

/** Every photo that carries a credit, for the /about credits list. */
export async function getPhotoCredits(): Promise<PhotoCredit[]> {
  const sb = createStaticClient();
  // PostgREST caps a response at max_rows (1000), so page through with .range():
  // a silently truncated list would drop CC-BY attributions.
  const PAGE = 500;
  const data: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await sb
      .from("recipe_photos")
      .select("credit, license, license_url, attribution_url, recipes(slug, title)")
      .order("recipe_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    data.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }
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
      // myplate.gov was retired on 2026-01-07; link the Internet Archive copy, as recipe pages do.
      attributionUrl: /^https?:\/\/(www\.)?myplate\.gov\//.test(r.attribution_url)
        ? `https://web.archive.org/web/${r.attribution_url}`
        : r.attribution_url,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
