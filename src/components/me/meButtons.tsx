"use client";

import { useTransition, type ReactNode } from "react";

import { Plus, X } from "lucide-react";

import { useMeUi } from "@/components/me/meUi";
import { Button } from "@/components/ui/button";
import { deleteFood } from "@/lib/actions/me";
import type { Meal } from "@/lib/me/types";

/* Small client buttons that let the server-rendered cards open the dashboard's dialogs. */

export function LogButton({ className }: { className?: string }) {
  const ui = useMeUi();
  return (
    <Button size="sm" className={className} onClick={() => ui.openLog()}>
      <Plus aria-hidden className="size-4" />
      Log
    </Button>
  );
}

/** The phone's floating "+ Log" pill. Sticky inside the page flow so it never covers the footer. */
export function LogFab() {
  const ui = useMeUi();
  return (
    <div className="pointer-events-none sticky bottom-6 z-20 mt-6 flex justify-end md:hidden">
      <button
        type="button"
        aria-label="Log"
        onClick={() => ui.openLog()}
        className="pointer-events-auto inline-flex h-13 items-center gap-1.5 rounded-full bg-herb px-5 text-[0.9375rem] font-medium text-on-herb shadow-frame transition-colors hover:bg-herb-deep"
      >
        <Plus aria-hidden className="size-4" />
        Log
      </button>
    </div>
  );
}

export function TargetsButton({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "link" }) {
  const ui = useMeUi();
  if (variant === "link") {
    return (
      <button type="button" onClick={() => ui.openTargets()} className="inline-flex min-h-11 items-center font-mono text-xs text-herb underline-offset-2 hover:underline sm:min-h-8">
        {children}
      </button>
    );
  }
  return (
    <Button size="sm" onClick={() => ui.openTargets()}>
      {children}
    </Button>
  );
}

export function AddFoodButton({ meal, label }: { meal: Meal; label: string }) {
  const ui = useMeUi();
  return (
    <button
      type="button"
      aria-label={`Add to ${label.toLowerCase()}`}
      onClick={() => ui.openFood(meal)}
      className="inline-flex min-h-11 items-center rounded-md px-2.5 text-[0.8125rem] font-medium text-herb transition-colors hover:bg-band sm:min-h-8"
    >
      + Add
    </button>
  );
}

export function RemoveFoodButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() => start(async () => void (await deleteFood(id)))}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-band hover:text-paprika-deep disabled:opacity-40 sm:size-8"
    >
      <X aria-hidden className="size-4" />
    </button>
  );
}
