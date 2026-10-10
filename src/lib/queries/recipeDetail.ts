import type { SupabaseClient } from "@supabase/supabase-js";

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
    ingredients: { canonical_name: string } | null;
  }[];
  recipe_steps: { sort_order: number; instruction: string }[];
  recipe_diets: { diets: { slug: string; name: string } | null }[];
  recipe_allergens: { allergens: { name: string } | null }[];
  recipe_cookware: { cookware: { name: string } | null }[];
};

const SELECT = `
  id, slug, title, servings, total_time_min, prep_time_min, cook_time_min,
  spice_level, image_url, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg,
  source_name, source_url, source_license,
  cuisines(name),
  recipe_ingredients(quantity, prep_note, is_optional, sort_order, units(name), ingredients(canonical_name)),
  recipe_steps(sort_order, instruction),
  recipe_diets(diets(slug, name)),
  recipe_allergens(allergens(name)),
  recipe_cookware(cookware(name))
`;

export async function getRecipeBySlug(slug: string): Promise<RecipeDetail | null> {
  const sb = createStaticClient() as unknown as SupabaseClient;
  const { data, error } = await sb
    .from("recipes")
    .select(SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as unknown as Row;

  // `recipe_photos` ships with the photos lane; before it is applied this
  // errors, and a missing credit must never take the recipe page down.
  let photo: RecipePhotoCredit | null = null;
  const photoRes = await sb
    .from("recipe_photos")
    .select("storage_path, credit, license, attribution_url, alt_text")
    .eq("recipe_id", r.id)
    .maybeSingle();
  if (!photoRes.error && photoRes.data) {
    const p = photoRes.data as {
      storage_path: string;
      credit: string | null;
      license: string;
      attribution_url: string;
      alt_text: string | null;
    };
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
}
