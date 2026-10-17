
import { createClient } from "@/lib/supabase/server";

/*
 * The cookware a signed-in cook owns (`user_cookware`, private: RLS lets a user
 * see and change only their own rows). Anonymous cooks keep the same list in the
 * URL (`ownedCookware`) and localStorage; see src/lib/cookwareStorage.ts.
 *
 * The table is newer than the generated types in src/types/database.ts, so the
 * client is used untyped here, like the other post-snapshot tables.
 */

export const MAX_OWNED_COOKWARE = 50;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

type Row = { cookware: { slug: string } | null };

/** Slugs the signed-in cook owns. Empty for signed-out callers (RLS returns no rows). */
export async function getMyCookwareSlugs(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_cookware").select("cookware(slug)");
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).flatMap((r) => (r.cookware ? [r.cookware.slug] : []));
}

export type SetCookwareResult =
  | { ok: true; slugs: string[] }
  | { ok: false; reason: "signed-out" | "failed" };

/**
 * Replace the caller's cookware with `slugs`. Unknown slugs are ignored.
 * Adds first and removes after, so a failure half-way never leaves the cook with
 * less than they had.
 */
export async function setMyCookware(slugs: string[]): Promise<SetCookwareResult> {
  const clean = [...new Set(slugs.filter((s) => typeof s === "string" && SLUG_RE.test(s)))].slice(
    0,
    MAX_OWNED_COOKWARE,
  );
  const server = await createClient();
  const {
    data: { user },
  } = await server.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };
  const supabase = server;

  let rows: { id: number; slug: string }[] = [];
  if (clean.length) {
    const known = await supabase.from("cookware").select("id, slug").in("slug", clean);
    if (known.error) return { ok: false, reason: "failed" };
    rows = (known.data ?? []) as { id: number; slug: string }[];
  }

  if (rows.length) {
    const { error } = await supabase
      .from("user_cookware")
      .upsert(
        rows.map((r) => ({ user_id: user.id, cookware_id: r.id })),
        { onConflict: "user_id,cookware_id", ignoreDuplicates: true },
      );
    if (error) return { ok: false, reason: "failed" };
  }

  const del = supabase.from("user_cookware").delete().eq("user_id", user.id);
  const { error: delError } = rows.length
    ? await del.not("cookware_id", "in", `(${rows.map((r) => r.id).join(",")})`)
    : await del;
  if (delError) return { ok: false, reason: "failed" };

  return { ok: true, slugs: rows.map((r) => r.slug) };
}
