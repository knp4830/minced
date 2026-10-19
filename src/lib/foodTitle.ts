import type { FoodHit } from "@/lib/foodHit";

/** "Kikkoman soy sauce" style title for a food hit: the brand first, unless the description already says it. */
export function foodTitle(hit: Pick<FoodHit, "label" | "brand">): string {
  const brand = hit.brand?.trim();
  if (!brand) return hit.label;
  return hit.label.toLowerCase().includes(brand.toLowerCase()) ? hit.label : `${brand} ${hit.label}`;
}
