"use client";

import { ACCOUNT_HINT_KEY, ACCOUNT_HOLD_ID } from "@/lib/accountHint";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import { logOutQuiet } from "@/lib/actions/auth";
import { toggleFavorite } from "@/lib/actions/favorites";

/*
 * Who is signed in and which recipes they have saved, for the whole site.
 *
 * Why this is client-side: recipe pages and browse are cached at the CDN and
 * identical for everyone. Reading the session on the server would make every
 * page dynamic. So the pages ship the same HTML to all, and this provider
 * fills in the personal parts after load with one small request (/api/me).
 *
 * The request is skipped when there is no Supabase auth cookie, so a
 * signed-out visitor costs the server nothing.
 */

type Status = "loading" | "out" | "in";
type Me = { name: string; initial: string };

type ToggleResult = "saved" | "removed" | "signed-out" | "failed" | "busy";

type AccountContext = {
  status: Status;
  me: Me | null;
  isSaved: (slug: string) => boolean;
  toggle: (slug: string) => Promise<ToggleResult>;
  /** Signs out, drops the signed-in UI at once, and goes home. */
  signOut: () => Promise<void>;
};

const Ctx = createContext<AccountContext | null>(null);

/** Pages where signing in, out or deleting an account happens; navigating to or from one means "ask again". */
const AUTH_PATH = /^\/(login|signup|account|settings|reset-password|forgot-password|auth)(\/|$)/;

/** Fired (on window) by Settings after the display name changes, so the header can show it without a reload. */
export const ACCOUNT_CHANGED_EVENT = "minced:account-changed";

/** Pages that only make sense signed in: signing out from one goes home. */
const SIGNED_IN_AREA = /^\/(account|settings|fridge|me)(\/|$)|^\/recipes\/new\/?$|^\/recipes\/[^/]+\/edit\/?$/;

const AUTH_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token/;

/**
 * "Might someone be signed in?" The Supabase auth cookies are httpOnly (wave 5/6
 * security hardening), so `document.cookie` can never see them — testing it made
 * every signed-in visitor look signed out and the whole signed-in UI went dead.
 * Only the server can tell, so a readable cookie is treated as a definite yes and
 * its absence as "unknown": the provider asks /api/me either way.
 */
export function hasAuthCookie(): boolean {
  try {
    if (AUTH_COOKIE.test(document.cookie)) return true;
  } catch {
    // no document (server) — fall through
  }
  return true;
}

/**
 * A one-bit, non-sensitive hint ("this browser was signed in last time") that lets the site layout
 * hold the header's account controls back before first paint, so a signed-in person does not see
 * the signed-out header flash. The server HTML is shared and cached, so it cannot know. Cleared
 * (and the hold released) as soon as /api/me answers.
 */

function rememberSignedIn(signedIn: boolean): void {
  try {
    localStorage.setItem(ACCOUNT_HINT_KEY, signedIn ? "1" : "0");
  } catch {
    /* blocked storage: the hint is only a nicety */
  }
  document.getElementById(ACCOUNT_HOLD_ID)?.remove();
}

export function useAccount(): AccountContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>");
  return ctx;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Starts "out" so server HTML and first client render agree (and no-JS shows "Log in").
  const [status, setStatus] = useState<Status>("out");
  const [me, setMe] = useState<Me | null>(null);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const [prompt, setPrompt] = useState<string | null>(null);
  // Slugs with a request in flight: a response that lands for one of these
  // must not overwrite the optimistic value with an older server snapshot.
  const pending = useRef(new Set<string>());
  const statusRef = useRef<Status>("out");
  statusRef.current = status;
  const lastPath = useRef<string | null>(null);

  const apply = useCallback((s: Status, who: Me | null, slugs: string[]) => {
    if (s !== "loading") rememberSignedIn(s === "in");
    setStatus(s);
    setMe(who);
    setSaved((prev) => {
      const next = new Set(slugs);
      for (const slug of pending.current) {
        if (prev.has(slug)) next.add(slug);
        else next.delete(slug);
      }
      return next;
    });
  }, []);

  // The list pages render the person's saved diet / allergen defaults on the server from a cookie and leave a
  // fingerprint of them in the page. If /api/me says the database now holds something else (another device
  // changed them, or this is the first request after logging in on a new device), refresh the page once.
  const refreshedFor = useRef<string | null>(null);
  const reconcilePrefs = useCallback(
    (hash: string) => {
      const have = document.querySelector("[data-prefs-hash]")?.getAttribute("data-prefs-hash");
      if (have === undefined || have === null || have === hash || refreshedFor.current === hash) return;
      refreshedFor.current = hash;
      router.refresh();
    },
    [router],
  );

  // Re-check when it can have changed: on first load, and whenever a navigation
  // touches the sign-in / account pages (logging in, out or deleting the account
  // all end in a redirect, and the provider outlives the page it was rendered
  // for). Browsing between recipes while already signed in does not repeat the
  // request: it cost an auth check plus two queries on every page change.
  useEffect(() => {
    const previous = lastPath.current;
    lastPath.current = pathname;
    if (!hasAuthCookie()) {
      apply("out", null, []);
      return;
    }
    if (
      statusRef.current === "in" &&
      previous !== null &&
      !AUTH_PATH.test(previous) &&
      !AUTH_PATH.test(pathname)
    ) {
      return;
    }
    let cancelled = false;
    // Cookie present: someone is probably signed in, so hold the header's
    // "Log in" link back until /api/me confirms, and ignore stars until then.
    if (statusRef.current === "out") setStatus("loading");
    (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const body = (await res.json()) as { user: Me | null; favorites: string[]; error?: boolean; prefsHash?: string };
        if (cancelled) return;
        // A failed lookup keeps whatever we knew; it must not sign anyone out in the UI.
        if (!res.ok || body.error) {
          if (statusRef.current === "loading") apply("out", null, []);
          return;
        }
        apply(body.user ? "in" : "out", body.user, body.favorites);
        if (body.user && body.prefsHash !== undefined) reconcilePrefs(body.prefsHash);
      } catch {
        if (!cancelled && statusRef.current === "loading") apply("out", null, []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, apply, reconcilePrefs]);

  // Settings tells us the display name changed, so the header shows it without a reload.
  useEffect(() => {
    const onChanged = async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        const body = (await res.json()) as { user: Me | null; favorites: string[]; error?: boolean };
        if (res.ok && !body.error && body.user) setMe(body.user);
      } catch {
        /* the header catches up on the next page */
      }
    };
    window.addEventListener(ACCOUNT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, onChanged);
  }, []);

  const toggle = useCallback(
    async (slug: string): Promise<ToggleResult> => {
      if (statusRef.current === "loading") return "busy";
      if (statusRef.current !== "in") {
        setPrompt(pathname);
        return "signed-out";
      }
      const wasSaved = saved.has(slug);
      const set = (on: boolean) =>
        setSaved((prev) => {
          const next = new Set(prev);
          if (on) next.add(slug);
          else next.delete(slug);
          return next;
        });

      set(!wasSaved); // optimistic: the star fills now, the server confirms after
      pending.current.add(slug);
      try {
        const result = await toggleFavorite(slug, !wasSaved);
        if (result.ok) return wasSaved ? "removed" : "saved";
        set(wasSaved);
        if (result.reason === "signed-out") {
          apply("out", null, []);
          setPrompt(pathname);
          return "signed-out";
        }
        return "failed";
      } catch {
        set(wasSaved);
        return "failed";
      } finally {
        pending.current.delete(slug);
      }
    },
    [saved, pathname, apply],
  );

  // Signing out through a server-action redirect is unreliable here: the @modal
  // intercepting route swallows the redirect on /account, and from other pages the
  // provider never re-asks. So sign out, reset the provider, then navigate ourselves.
  const signOut = useCallback(async () => {
    try {
      await logOutQuiet();
    } catch {
      // Fall through: the re-check below says whether the session really ended.
    }
    apply("out", null, []);
    const here = window.location.pathname;
    // Signed-in areas and auth pages have nothing to show a signed-out visitor, and on auth
    // pages the @modal slot swallows a soft navigation: leave with a full page load.
    if (AUTH_PATH.test(here) || SIGNED_IN_AREA.test(here)) {
      window.location.assign("/");
      return;
    }
    // A public page stays where it is. The fridge page carries the saved fridge in its URL, so
    // drop that; every page re-renders and the provider asks /api/me once more to confirm.
    if (here === "/pantry" && window.location.search) router.replace("/pantry");
    router.refresh();
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const body = (await res.json()) as { user: Me | null; favorites: string[] };
      if (res.ok && body.user) apply("in", body.user, body.favorites); // sign-out did not take
    } catch {
      // Offline: the cookie is gone either way; stay signed out.
    }
  }, [apply, router]);

  const value = useMemo<AccountContext>(
    () => ({ status, me, isSaved: (slug) => saved.has(slug), toggle, signOut }),
    [status, me, saved, toggle, signOut],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <LoginPrompt returnTo={prompt} onClose={() => setPrompt(null)} />
    </Ctx.Provider>
  );
}

/**
 * Shown when a signed-out visitor taps a star. A native <dialog>: focus moves
 * in, Escape closes it, and the page behind is inert, with no extra code.
 */
function LoginPrompt({ returnTo, onClose }: { returnTo: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (returnTo !== null && !d.open) d.showModal();
    if (returnTo === null && d.open) d.close();
  }, [returnTo]);

  const next = encodeURIComponent(returnTo ?? "/");
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // the backdrop
      }}
      aria-labelledby="login-prompt-h"
      className="m-auto w-[min(92vw,22rem)] rounded-xl border border-line bg-surface p-5 text-ink shadow-frame backdrop:bg-scrim"
    >
      <h2 id="login-prompt-h" className="text-xl">
        Log in to save recipes
      </h2>
      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-muted">
        Your saved recipes live in your account, so they&apos;re there on every device.
      </p>
      <div className="mt-4 flex flex-col gap-2.5">
        <Link
          href={`/login?next=${next}`}
          onClick={onClose}
          className={buttonVariants({ variant: "primary", size: "md" })}
        >
          Log in
        </Link>
        <Link
          href={`/signup?next=${next}`}
          onClick={onClose}
          className={buttonVariants({ variant: "secondary", size: "md" })}
        >
          Create an account
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-md text-sm text-ink-muted hover:text-herb"
        >
          Not now
        </button>
      </div>
    </dialog>
  );
}
