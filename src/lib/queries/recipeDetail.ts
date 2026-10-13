import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import { primaryAisle } from "@/lib/placeholderTone";
import { photoPublicUrl, usableImageUrl } from "@/lib/photos";
import { createStaticClient } from "@/lib/supabase/static";

/**
 * Everything one recipe page needs, in a single round trip (PostgREST embeds
 * the related tables), plus the photo credit lookup.
 *
 * Uses the cookie-free client so the page can be cached; see supabase/static.ts.
 */

export type RecipeIngredientLine = {
  quantity: number | null;
  unit: string | null;
  name: string;
  prepNote: string | null;
  optional: boolean;
  /** Canonical ingredient id, for marking have/missing against a fridge. */
  ingredientId: number | null;
  /** Family parent ("onion" for "yellow onion"); a parent in the fridge covers it. */
  familyId: number | null;
  /** Salt, oil and friends: assumed, never marked missing. */
  isStaple: boolean;
};

export type RecipePhotoCredit = {
  url: string;
  credit: string | null;
  license: string;
  attributionUrl: string;
  altText: string | null;
};

export type RecipeDetail = {
  id: string;
  slug: string;
  title: string;
  servings: number;
  cuisine: string | null;
  /** Aisle of the main ingredient; tints the photo-less hero tile. */
  aisle: string | null;
  totalTimeMin: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  spiceLevel: number | null;
  imageUrl: string | null;
  photo: RecipePhotoCredit | null;
  nutrition: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    sodiumMg: number | null;
  };
  ingredients: RecipeIngredientLine[];
  steps: string[];
  diets: { slug: string; name: string }[];
  allergens: string[];
  cookware: string[];
  sourceName: string | null;
  sourceUrl: string | null;
  sourceLicense: string | null;
};

type Row = {
  id: string;
  slug: string;
  title: string;
  servings: number;
  total_time_min: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  spice_level: number | null;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  source_name: string | null;
  source_url: string | null;
  source_license: string | null;
  cuisines: { name: string } | null;
  recipe_ingredients: {
    quantity: number | null;
    prep_note: string | null;
    is_optional: boolean;
    sort_order: number;
    units: { name: string } | null;
    ingredients: {
      id: number;
      canonical_name: string;
      aisle_category: string;
      family_id: number | null;
      is_pantry_staple: boolean;
    } | null;
  }[];
  recipe_steps: { sort_order: number; instruction: string }[];
  recipe_diets: { diets: { slug: string; name: string } | null }[];
  recipe_allergens: { allergens: { name: string } | null }[];
  recipe_cookware: { cookware: { name: string } | null }[];
  recipe_photos: PhotoRow | PhotoRow[] | null;
};

type PhotoRow = {
  storage_path: string;
  credit: string | null;
  license: string;
  attribution_url: string;
  alt_text: string | null;
};

const SELECT = `
  id, slug, title, servings, total_time_min, prep_time_min, cook_time_min,
  spice_level, image_url, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg,
  source_name, source_url, source_license,
  cuisines(name),
  recipe_ingredients(quantity, prep_note, is_optional, sort_order, units(name), ingredients(id, canonical_name, aisle_category, family_id, is_pantry_staple)),
  recipe_steps(sort_order, instruction),
  recipe_diets(diets(slug, name)),
  recipe_allergens(allergens(name)),
  recipe_cookware(cookware(name)),
  recipe_photos(storage_path, credit, license, attribution_url, alt_text)
`;

/**
 * `cache()` dedupes within one render: `generateMetadata` and the page both ask
 * for the same slug, which used to be two full database reads per render.
 */
export const getRecipeBySlug = cache(async function getRecipeBySlug(
  slug: string,
): Promise<RecipeDetail | null> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const { data, error } = await sb
    .from("recipes")
    .select(SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Row;

  // The photo rides along in the same query (one round trip, not two).
  let photo: RecipePhotoCredit | null = null;
  const p = Array.isArray(r.recipe_photos) ? r.recipe_photos[0] : r.recipe_photos;
  if (p) {
    photo = {
      url: photoPublicUrl(p.storage_path),
      credit: p.credit,
      license: p.license,
      attributionUrl: p.attribution_url,
      altText: p.alt_text,
    };
  }

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    servings: r.servings,
    cuisine: r.cuisines?.name ?? null,
    aisle: primaryAisle(r.recipe_ingredients),
    totalTimeMin: r.total_time_min || null,
    prepTimeMin: r.prep_time_min || null,
    cookTimeMin: r.cook_time_min || null,
    spiceLevel: r.spice_level,
    imageUrl: usableImageUrl(r.image_url),
    photo,
    nutrition: {
      calories: r.calories,
      proteinG: r.protein_g,
      carbsG: r.carbs_g,
      fatG: r.fat_g,
      fiberG: r.fiber_g,
      sodiumMg: r.sodium_mg,
    },
    ingredients: [...r.recipe_ingredients]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({
        quantity: i.quantity,
        unit: i.units?.name ?? null,
        name: i.ingredients?.canonical_name ?? "",
        prepNote: i.prep_note,
        optional: i.is_optional,
        ingredientId: i.ingredients?.id ?? null,
        familyId: i.ingredients?.family_id ?? null,
        isStaple: i.ingredients?.is_pantry_staple ?? false,
      })),
    steps: [...r.recipe_steps]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => s.instruction),
    diets: r.recipe_diets.flatMap((d) => (d.diets ? [d.diets] : [])),
    allergens: r.recipe_allergens.flatMap((a) => (a.allergens ? [a.allergens.name] : [])),
    cookware: r.recipe_cookware.flatMap((c) => (c.cookware ? [c.cookware.name] : [])),
    sourceName: r.source_name,
    sourceUrl: r.source_url,
    sourceLicense: r.source_license,
  };
});
