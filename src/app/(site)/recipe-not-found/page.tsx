import type { Metadata } from "next";
import { RecipeNotFoundView } from "@/components/shell/notFoundView";

export const metadata: Metadata = {
  title: "Recipe not found",
  robots: { index: false, follow: true },
};

/*
 * Never linked to. The middleware rewrites an unknown /recipes/<slug> here and
 * answers with status 404 (see src/lib/recipeGate.ts for why it cannot be done in
 * the recipe page). The same view backs /recipes/[slug]/not-found.tsx.
 */
export default function RecipeNotFoundPage() {
  return <RecipeNotFoundView />;
}
