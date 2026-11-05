import { headers } from "next/headers";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/*
 * Rate limiting for public server actions. The counting happens in Postgres
 * (public.check_rate_limit, migration 20261023210000) so it needs no package and works across
 * serverless instances. Server-only: it reads request headers.
 *
 * Two rules matter more than the numbers:
 *  - It fails OPEN. If the limiter errors or is slow, the visitor is let through and the error is
 *    logged, so a limiter fault can never lock everybody out of the site.
 *  - Limits are generous. A real person who mistypes a password a few times never sees the message.
 */

export type LimitKind = "signup" | "login" | "login_email" | "reset" | "reset_email" | "suggest";

export const TOO_MANY = "Too many tries just now. Please wait a minute and try again.";

type Rule = { limit: number; windowSeconds: number };

/** Per-email counters can be abused to lock a person out, so they run only with the server-only secret key (see allow()). */
const EMAIL_KINDS: LimitKind[] = ["login_email", "reset_email"];

/** Attempts allowed per window. The database holds the same numbers and ignores what the caller sends (migration 20261023220000), so keep both in step. IP rules are looser than email rules because many people share an IP (a school, a household). */
export const LIMITS: Record<LimitKind, Rule> = {
  signup: { limit: 10, windowSeconds: 600 },
  login: { limit: 30, windowSeconds: 300 },
  login_email: { limit: 10, windowSeconds: 300 },
  reset: { limit: 10, windowSeconds: 600 },
  reset_email: { limit: 3, windowSeconds: 600 },
  suggest: { limit: 120, windowSeconds: 60 },
};

const LIMITER_TIMEOUT_MS = 1500;

/**
 * The visitor's address as Vercel reports it. Vercel sets x-real-ip and overwrites x-forwarded-for
 * at its edge, so on Vercel a visitor cannot choose these values. Off Vercel (local dev) they are
 * whatever the client sent, which is fine because there is nothing to protect there.
 */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || null;
}

/** Counts one attempt. Returns true when the attempt is allowed (also when the limiter itself fails). */
export async function allow(kind: LimitKind, subject: string | null | undefined): Promise<boolean> {
  if (!subject) return true;
  const rule = LIMITS[kind];
  try {
    let supabase;
    if (EMAIL_KINDS.includes(kind)) {
      // Needs SUPABASE_SECRET_KEY (server-only). Without it the email limit is skipped: the IP limit and Supabase Auth's own limits still apply.
      const secret = process.env.SUPABASE_SECRET_KEY;
      if (!secret) return true;
      supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      supabase = await createClient();
    }
    // Typed loosely on purpose: src/types/database.ts predates this function until the integrator runs db:types.
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
    const call = rpc("check_rate_limit", {
      p_kind: kind,
      p_subject: subject,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });
    const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), LIMITER_TIMEOUT_MS));
    const res = await Promise.race([call, timeout]);
    if (res === "timeout") {
      console.error("[rateLimit] limiter timed out; allowing", kind);
      return true;
    }
    if (res.error) {
      console.error("[rateLimit] limiter error; allowing", kind, res.error.message);
      return true;
    }
    return res.data !== false;
  } catch (e) {
    console.error("[rateLimit] limiter threw; allowing", kind, e instanceof Error ? e.message : e);
    return true;
  }
}

/** Counts one attempt per address and, when given, per email. True means go ahead. */
export async function allowIpAndEmail(
  ipKind: LimitKind,
  emailKind: LimitKind | null,
  email?: string,
): Promise<boolean> {
  const ip = await clientIp();
  const [okIp, okEmail] = await Promise.all([
    allow(ipKind, ip),
    emailKind && email ? allow(emailKind, email) : Promise.resolve(true),
  ]);
  return okIp && okEmail;
}
