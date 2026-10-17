import { BookmarkCheck, CookingPot, ShoppingBasket } from "lucide-react";
import Link from "next/link";

import { ForgotPasswordForm, LoginForm, SignupForm } from "@/components/account/authForms";
import { GoogleButton } from "@/components/account/googleButton";
import { buttonVariants } from "@/components/ui/button";
import { safeNext } from "@/lib/auth/validate";
import { GOOGLE_SIGNIN_ENABLED } from "@/lib/flags";

/*
 * One definition of the sign-in screens, rendered two ways: as the full pages
 * (/login, /signup, /forgot-password, used on direct load and from emails) and
 * inside the modal that opens over whatever page the visitor was on. Server
 * component; the forms are the client parts.
 *
 * Switching between views uses `replace`, so toggling Log in / Create account
 * never stacks history and closing the modal always goes back to the page.
 */

export type AuthView = "login" | "signup" | "forgot";
type Sp = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readNext(sp: Sp): string | undefined {
  const raw = one(sp.next);
  return raw ? safeNext(raw) : undefined;
}

const TITLES: Record<AuthView, { title: string; lead: string }> = {
  login: { title: "Welcome back", lead: "Log in to see your saved recipes and your fridge." },
  signup: {
    title: "Create your account",
    lead: "Save recipes, keep your fridge, and take your shopping list anywhere. Just an email and a password.",
  },
  forgot: { title: "Reset your password", lead: "Enter your email and we'll send a link to choose a new one." },
};

function Divider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ink-subtle" aria-hidden>
      <span className="h-px flex-1 bg-line-strong" />
      {label}
      <span className="h-px flex-1 bg-line-strong" />
    </div>
  );
}

export function AuthPanel({ view, searchParams, headingTag = "h1" }: { view: AuthView; searchParams: Sp; headingTag?: "h1" | "h2" }) {
  const next = readNext(searchParams);
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const Heading = headingTag;
  const { title } = TITLES[view];
  const lead =
    view === "signup" && GOOGLE_SIGNIN_ENABLED
      ? "Save recipes, keep your fridge, and take your shopping list anywhere. Use your Google account, or just an email and a password."
      : TITLES[view].lead;

  const notice =
    view === "login" && one(searchParams.notice) === "deleted"
      ? "Your account is deleted. Your login and saved recipes are gone."
      : null;
  const errorCode = view === "login" ? one(searchParams.error) : undefined;
  const linkError =
    errorCode === "link"
      ? "That link has expired or was already used. Log in, or request a new one."
      : errorCode === "oauth_cancelled"
        ? "Google sign-in was cancelled, so nothing changed. You can try again, or use your email."
        : errorCode === "oauth"
          ? "We couldn't sign you in with Google just now. Try again, or use your email and password."
          : null;
  const showGoogle = GOOGLE_SIGNIN_ENABLED && view !== "forgot";

  return (
    <>
      <Heading id="auth-title" className="text-[1.625rem] leading-tight md:text-[1.875rem]">
        {title}
      </Heading>
      <p className="mt-1.5 mb-6 text-[0.9375rem] leading-relaxed text-ink-muted">{lead}</p>

      {notice && (
        <p role="status" className="mb-4 rounded-lg border border-line-strong bg-surface px-3.5 py-2.5 text-[0.875rem] leading-snug">
          {notice}
        </p>
      )}
      {linkError && (
        <p role="alert" className="mb-4 rounded-lg border border-paprika/40 bg-paprika/5 px-3.5 py-2.5 text-[0.875rem] leading-snug text-paprika-deep">
          {linkError}
        </p>
      )}

      {showGoogle && (
        <>
          <GoogleButton next={next} />
          {view === "signup" && (
            <p className="mt-2 text-center text-[0.75rem] leading-relaxed text-ink-subtle">
              By continuing with Google you agree to the{" "}
              <Link href="/terms" className="underline underline-offset-2 hover:text-herb">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-herb">
                Privacy Policy
              </Link>
              .
            </p>
          )}
          <Divider label="or use your email" />
        </>
      )}

      {view === "login" && <LoginForm next={next} />}
      {view === "signup" && <SignupForm next={next} />}
      {view === "forgot" && <ForgotPasswordForm />}

      <Divider />
      {view === "login" && (
        <Link
          replace
          href={`/signup${nextQuery}`}
          className={buttonVariants({ variant: "secondary", size: "lg" }) + " w-full"}
        >
          New here? Create an account
        </Link>
      )}
      {view === "signup" && (
        <Link
          replace
          href={`/login${nextQuery}`}
          className={buttonVariants({ variant: "secondary", size: "lg" }) + " w-full"}
        >
          I already have an account
        </Link>
      )}
      {view === "forgot" && (
        <Link
          replace
          href={`/login${nextQuery}`}
          className={buttonVariants({ variant: "secondary", size: "lg" }) + " w-full"}
        >
          Back to log in
        </Link>
      )}

      {view !== "signup" && (
        <p className="mt-5 text-center text-[0.75rem] leading-relaxed text-ink-subtle">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-herb">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-herb">
            Privacy Policy
          </Link>
          .
        </p>
      )}
    </>
  );
}

/** What an account is for, in the voice of the product. Shown beside the full-page forms. */
export function AuthBenefits() {
  const items = [
    { Icon: BookmarkCheck, title: "Save what you cook", body: "Tap the star on any recipe and it is waiting in your library on every device." },
    { Icon: CookingPot, title: "Keep your fridge", body: "Your fridge, with dates, so Minced can suggest what to use up first." },
    { Icon: ShoppingBasket, title: "One shopping list", body: "Add from several recipes and shop from one list, signed in or not." },
  ];
  return (
    <ul className="space-y-6">
      {items.map(({ Icon, title, body }) => (
        <li key={title} className="flex gap-4">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-herb/10 text-herb">
            <Icon className="size-5" />
          </span>
          <div>
            <p className="font-display text-lg leading-tight">{title}</p>
            <p className="mt-1 text-[0.9375rem] leading-relaxed text-ink-muted">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
