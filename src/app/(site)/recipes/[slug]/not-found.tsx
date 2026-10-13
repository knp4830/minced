import type { Metadata } from "next";
import { RecipeNotFoundView } from "@/components/shell/notFoundView";

export const metadata: Metadata = { title: "Recipe not found" };

export default function RecipeNotFound() {
  return <RecipeNotFoundView />;
}
