import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Filtered and searched lists (/recipes?diet=…&exclude=…): endless combinations of one
          // catalog. Crawlers walking them burned most of the Vercel free-tier request quota.
          "/recipes?",
          "/api/", "/account", "/settings", "/me", "/fridge", "/pantry", "/shopping", "/login", "/signup", "/forgot-password", "/reset-password", "/auth/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
