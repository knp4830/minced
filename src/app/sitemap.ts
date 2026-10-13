import type { MetadataRoute } from "next";

import { getSitemapRecipes } from "@/lib/queries/sitemap";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const recipes = await getSitemapRecipes();
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/recipes`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.3 },
    ...recipes.map((r) => ({
      url: `${SITE_URL}/recipes/${r.slug}`,
      lastModified: r.updatedAt ?? undefined,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
