"use client";

import { BookOpen, CalendarDays, LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { logOut } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Header auth control. Signed out: "Log in / Sign up", which opens the sign-in
 * dialog over the current page (and brings the visitor back to it). Signed in:
 * a 32px herb circle with the person's initial that opens the account menu.
 * The 44px tap target is the button; the circle is drawn inside it.
 *
 * Server HTML always says "Log in / Sign up" (the page is cached and the same
 * for everyone). If an auth cookie exists we hide it until /api/me answers, so
 * a signed-in person doesn't see the wrong control flash.
 */
export function HeaderAccount({ className }: { className?: string }) {
  const { status, me } = useAccount();
  const router = useRouter();

  if (status === "in" && me) return <AccountMenu className={className} name={me.name} initial={me.initial} />;

  return (
    <Link
      href="/login"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        // Come back to this exact page (filters and picks included) after signing in.
        e.preventDefault();
        const here = window.location.pathname + window.location.search;
        router.push(here.length <= 300 && here !== "/" ? `/login?next=${encodeURIComponent(here)}` : "/login");
      }}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md px-2 text-[0.84375rem] font-medium whitespace-nowrap text-ink transition-colors hover:text-herb",
        status === "loading" && "opacity-0",
        className,
      )}
    >
      <span className="sm:hidden">Log in</span>
      <span className="hidden sm:inline">Log in / Sign up</span>
    </Link>
  );
}

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[0.9375rem] text-ink transition-colors hover:bg-ink/6 hover:text-herb focus-visible:bg-ink/6";

function AccountMenu({ className, name, initial }: { className?: string; name: string; initial: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Your account, ${name}`}
        onClick={() => setOpen((o) => !o)}
        className="group inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
      >
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-herb font-sans text-[0.875rem] font-semibold text-on-herb transition-colors group-hover:bg-herb-deep"
        >
          {initial}
        </span>
      </button>
      {open && (
        <div
          id={id}
          className="absolute top-full right-0 z-50 mt-1 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-frame"
          onClick={(e) => {
            // A link closes the menu. (Not the sign-out button: unmounting its form would cancel the submit.)
            if ((e.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <p className="truncate px-3 pt-2 pb-1.5 font-mono text-[0.75rem] text-ink-muted">{name}</p>
          <Link href="/account" className={ITEM}>
            <UserRound aria-hidden className="size-4 text-ink-muted" />
            Saved recipes
          </Link>
          <Link href="/account?tab=book" className={ITEM}>
            <BookOpen aria-hidden className="size-4 text-ink-muted" />
            My recipes
          </Link>
          <Link href="/me" className={ITEM}>
            <CalendarDays aria-hidden className="size-4 text-ink-muted" />
            Me
            <span className="ml-auto rounded-full border border-line-strong px-2 py-0.5 font-mono text-[0.625rem] text-ink-muted">
              soon
            </span>
          </Link>
          <Link href="/account?tab=settings" className={ITEM}>
            <Settings aria-hidden className="size-4 text-ink-muted" />
            Account settings
          </Link>
          <form action={logOut} className="mt-1 border-t border-line pt-1">
            <button type="submit" className={cn(ITEM, "text-paprika-deep hover:text-paprika-deep")}>
              <LogOut aria-hidden className="size-4" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
