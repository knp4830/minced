import { createStaticClient } from "@/lib/supabase/static";

/** Every published recipe slug with its last change, paged so the sitemap survives growth past 1,000 rows. */
export async function getSitemapRecipes(): Promise<{ slug: string; updatedAt: string | null }[]> {
  const supabase = createStaticClient();
  const out: { slug: string; updatedAt: string | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("recipes")
      .select("slug, updated_at")
      // The anon key already sees published rows only (RLS); say so here too so a policy change cannot leak drafts into the sitemap.
      .eq("status", "published")
      .order("slug", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at ?? null })));
    if (rows.length < PAGE) break;
  }
  return out;
}
