import { suggestIngredients } from "@/lib/queries/matcher";

/**
 * Autocomplete endpoint for the pantry input. The browser never talks to
 * Supabase directly (CLAUDE.md: every query goes through src/lib/queries);
 * this thin handler is the seam. GET /api/ingredients/suggest?q=chick
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 60) ?? "";
  try {
    const suggestions = await suggestIngredients(q, 8);
    return Response.json(
      { suggestions },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=3600" } },
    );
  } catch {
    return Response.json({ suggestions: [] }, { status: 502 });
  }
}
