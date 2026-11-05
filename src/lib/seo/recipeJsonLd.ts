import type { RecipeDetail } from "@/lib/queries/recipeDetail";
import { FDC, roundForLabel } from "@/lib/nutrients";
import { SITE_URL } from "@/lib/site";

/**
 * schema.org/Recipe for one recipe page, shaped to Google's recipe rich-result documentation:
 * required `name` and `image`; recommended author, dates, description, keywords, times, yield,
 * ingredients, HowToStep instructions and (only when we trust it) nutrition.
 *
 * Pure: takes the page model, returns plain data, so scripts/test-seo.mts can check what a page
 * would publish without a database.
 */

const ORG_MINCED = { "@type": "Organization", name: "Minced", url: SITE_URL } as const;

/** Whole minutes to an ISO 8601 duration ("PT45M", "PT1H30M"); undefined when the time is unknown. */
export function isoDuration(minutes: number | null | undefined): string | undefined {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `PT${h ? `${h}H` : ""}${m || !h ? `${m}M` : ""}`;
}

/** Who made the recipe, credited the way its licence asks. Never a private person. */
export function recipeAuthor(recipe: Pick<RecipeDetail, "sourceName" | "sourceLicense">) {
  if (recipe.sourceName?.includes("MyPlate")) {
    return { "@type": "Organization", name: "USDA MyPlate Kitchen (U.S. Department of Agriculture)" };
  }
  if (recipe.sourceLicense?.startsWith("Contains public sector information")) {
    return { "@type": "Organization", name: "NHS Healthier Families" };
  }
  // Minced originals, mockup recipes and cook-submitted ones: Minced. A submitting cook's
  // account is not published (author exposure is still an open decision, LEGAL-COMPLIANCE).
  return ORG_MINCED;
}

const qty = (n: number) => String(Math.round(n * 100) / 100);

export function ingredientLine(i: RecipeDetail["ingredients"][number]): string {
  const base = [i.quantity != null ? qty(i.quantity) : null, i.unit, i.name].filter(Boolean).join(" ");
  const note = i.prepNote?.trim();
  let line = note ? `${base}, ${note}` : base;
  if (i.optional && !/\boptional\b/i.test(line)) line += " (optional)";
  return line;
}

/** Nutrition is published only when the label itself is trustworthy (status "complete") and calories exist. */
export function shouldPublishNutrition(recipe: RecipeDetail, nutritionStatus: string | null | undefined): boolean {
  if (recipe.nutrition.calories == null) return false;
  // A row with no computed status carries USDA's own published columns (MyPlate).
  if (nutritionStatus == null) return !!recipe.sourceName?.includes("MyPlate");
  return nutritionStatus === "complete";
}

export function recipeJsonLd(recipe: RecipeDetail, opts: { nutritionStatus?: string | null } = {}) {
  const image = recipe.photo?.url ?? recipe.imageUrl;
  const n = recipe.nutrition;
  const keywords = [recipe.cuisine, ...recipe.diets.map((d) => d.name)].filter(Boolean).join(", ");
  const total = isoDuration(recipe.totalTimeMin);
  const prep = isoDuration(recipe.prepTimeMin);
  const cook = isoDuration(recipe.cookTimeMin);
  const publishNutrition = shouldPublishNutrition(recipe, opts.nutritionStatus);

  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "@id": `${SITE_URL}/recipes/${recipe.slug}#recipe`,
    name: recipe.title,
    url: `${SITE_URL}/recipes/${recipe.slug}`,
    description: `${recipe.title}: ${recipe.ingredients.length} ingredients, ${recipe.steps.length} steps, serves ${recipe.servings}. Ingredients and steps, nothing else.`,
    // Google needs an image for a rich result. A recipe without a photo is still valid markup, and a
    // generated card is not a picture of the dish, so no image is invented.
    ...(image ? { image: [image] } : {}),
    author: recipeAuthor(recipe),
    publisher: ORG_MINCED,
    ...(recipe.publishedAt ? { datePublished: recipe.publishedAt.slice(0, 10) } : {}),
    ...(recipe.updatedAt ? { dateModified: recipe.updatedAt.slice(0, 10) } : {}),
    ...(keywords ? { keywords } : {}),
    ...(recipe.cuisine ? { recipeCuisine: recipe.cuisine } : {}),
    ...(prep ? { prepTime: prep } : {}),
    ...(cook ? { cookTime: cook } : {}),
    ...(total ? { totalTime: total } : {}),
    recipeYield: [String(recipe.servings), `${recipe.servings} servings`],
    recipeIngredient: recipe.ingredients.map(ingredientLine).filter(Boolean),
    recipeInstructions: recipe.steps.map((text, i) => ({ "@type": "HowToStep", position: i + 1, text })),
    ...(publishNutrition
      ? {
          nutrition: {
            "@type": "NutritionInformation",
            servingSize: "1 serving",
            calories: `${roundForLabel(n.calories as number, { unit: "kcal", fdcNumber: FDC.energy })} calories`,
            ...(n.proteinG != null ? { proteinContent: `${Math.round(n.proteinG)} g` } : {}),
            ...(n.carbsG != null ? { carbohydrateContent: `${Math.round(n.carbsG)} g` } : {}),
            ...(n.fatG != null ? { fatContent: `${Math.round(n.fatG)} g` } : {}),
            ...(n.fiberG != null ? { fiberContent: `${Math.round(n.fiberG)} g` } : {}),
            ...(n.sodiumMg != null ? { sodiumContent: `${Math.round(n.sodiumMg)} mg` } : {}),
          },
        }
      : {}),
  };
}
