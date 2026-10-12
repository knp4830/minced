import type { SupabaseClient, User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  /** Display name if the person set one, else the part of the email before the @. */
  name: string;
  /** One capital letter for the avatar circle. */
  initial: string;
  createdAt: string;
};

export function displayNameFor(user: Pick<User, "email">, displayName: string | null | undefined) {
  const email = user.email ?? "";
  return displayName?.trim() || email.split("@")[0] || "You";
}

/**
 * The signed-in user, verified with the Auth server (not just decoded from the
 * cookie), or null. Cookie-reading, so only call it from dynamic routes.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const name = displayNameFor(user, profile?.display_name);
  return {
    id: user.id,
    email: user.email ?? "",
    name,
    initial: name.charAt(0).toUpperCase() || "?",
    createdAt: user.created_at,
  };
}

/** Irreversibly deletes the caller's account (profile and favourites cascade). */
export async function deleteMyAccount(): Promise<boolean> {
  const supabase = await createClient();
  // Cast: src/types/database.ts is regenerated at integration, after this migration is applied.
  const { error } = await (supabase as unknown as SupabaseClient).rpc("delete_my_account");
  return !error;
}
