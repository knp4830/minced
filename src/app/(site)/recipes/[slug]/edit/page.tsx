import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RecipeForm } from "@/components/recipe/recipeForm";
import { USER_RECIPES_ENABLED } from "@/lib/flags";
import { getCurrentUser } from "@/lib/queries/account";
import { getFormOptions, getMyRecipeBySlug, getMyRecipeFoods } from "@/lib/queries/myRecipes";
import { tidyLabel } from "@/lib/foodHit";
import { foodTitle } from "@/lib/foodTitle";
import { valuesFromDetail } from "@/lib/recipeForm";
import { SLUG_RE } from "@/lib/validate";

export const metadata: Metadata = {
  title: "Edit recipe",
  robots: { index: false },
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditRecipePage({ params, searchParams }: Props) {
  if (!USER_RECIPES_ENABLED) notFound();
  const { slug } = await params;
  const sp = await searchParams;
  const justSaved = (Array.isArray(sp.saved) ? sp.saved[0] : sp.saved) === "1";
  if (!SLUG_RE.test(slug)) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/recipes/${slug}/edit`)}`);

  // Only the author's own recipes come back: someone else's slug is a plain 404,
  // the same answer as a slug that does not exist.
  const [recipe, options] = await Promise.all([getMyRecipeBySlug(slug), getFormOptions()]);
  if (!recipe) notFound();

  // Brand choices saved with the lines (empty until the nutrition tables exist).
  const foods = await getMyRecipeFoods(recipe.id);
  const initial = valuesFromDetail(recipe);
  initial.ingredients = initial.ingredients.map((row, i) => {
    const f = foods.find((x) => x.pos === i);
    return f ? { ...row, fdcId: f.fdcId, foodLabel: f.label ? foodTitle({ label: tidyLabel(f.label), brand: f.brand }) : undefined } : row;
  });

  return (
    <RecipeForm
      options={options}
      initial={initial}
      justSaved={justSaved}
      recipe={{
        id: recipe.id,
        slug: recipe.slug,
        status: recipe.status,
        allergens: recipe.allergens,
        returned: recipe.returned,
        reviewNote: recipe.review_note,
      }}
    />
  );
}
