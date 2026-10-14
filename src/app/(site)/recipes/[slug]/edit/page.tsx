import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RecipeForm } from "@/components/recipe/recipeForm";
import { getCurrentUser } from "@/lib/queries/account";
import { getFormOptions, getMyRecipeBySlug } from "@/lib/queries/myRecipes";
import { SLUG_RE, valuesFromDetail } from "@/lib/recipeForm";

export const metadata: Metadata = {
  title: "Edit recipe",
  robots: { index: false },
};

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditRecipePage({ params, searchParams }: Props) {
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

  return (
    <RecipeForm
      options={options}
      initial={valuesFromDetail(recipe)}
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
