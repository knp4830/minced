"use client";

import { useRouter } from "next/navigation";

import { startNavProgress } from "@/components/shell/navProgress";
import { cn } from "@/lib/utils";

/**
 * "Only what I can make now": a real switch (role + aria-checked) whose state lives in the URL
 * (`?now=1`), like every other filter. Read at click time so the page stays free of Suspense.
 */
export function MakeNowSwitch({ on, className }: { on: boolean; className?: string }) {
  const router = useRouter();

  function flip() {
    const params = new URLSearchParams(window.location.search);
    params.delete("cursor");
    params.delete("group");
    if (on) params.delete("now");
    else params.set("now", "1");
    const qs = params.toString().replaceAll("%2C", ",");
    startNavProgress();
    router.push(`/pantry${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={flip}
      className={cn(
        "group inline-flex min-h-11 items-center gap-3 rounded-lg text-left text-[0.9375rem] font-medium text-ink",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          on ? "border-herb bg-herb" : "border-line-strong bg-sunken group-hover:border-herb",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4.5 rounded-full bg-surface shadow-lift transition-transform duration-150",
            on && "translate-x-5",
          )}
        />
      </span>
      Only what I can make now
    </button>
  );
}
