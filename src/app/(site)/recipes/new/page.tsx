import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { RecipeForm } from "@/components/recipe/recipeForm";
import { USER_RECIPES_ENABLED } from "@/lib/flags";
import { getCurrentUser } from "@/lib/queries/account";
import { getFormOptions } from "@/lib/queries/myRecipes";
import { emptyValues } from "@/lib/recipeForm";

export const metadata: Metadata = {
  title: "Create a recipe",
  robots: { index: false },
};

export default async function NewRecipePage() {
  if (!USER_RECIPES_ENABLED) notFound();
  // Middleware already redirects signed-out visitors; this is the real check.
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Frecipes%2Fnew");

  const options = await getFormOptions();
  return <RecipeForm options={options} initial={emptyValues()} recipe={null} />;
}
