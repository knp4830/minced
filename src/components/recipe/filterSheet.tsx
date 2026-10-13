"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

/**
 * Phone filters: a "Filters" button that opens a bottom sheet (handoff, screen 2).
 * The controls inside are the same server-rendered links as the desktop rail,
 * passed in as children, so filter state still lives in the URL. A native
 * <dialog> supplies the focus trap, Escape and inert background; the sheet
 * stays open while chips are toggled and closes from "Show N recipes".
 */
export function FilterSheet({
  activeCount,
  showLabel,
  children,
}: {
  activeCount: number;
  /** Label of the closing button, e.g. "Show 959 recipes". */
  showLabel: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <div className="mb-5 lg:hidden">
      <Button
        aria-haspopup="dialog"
        size="md"
        onClick={() => ref.current?.showModal()}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filters
        {activeCount > 0 && (
          <span className="rounded-full bg-on-herb px-2 py-0.5 font-mono text-[0.6875rem] text-herb">
            {activeCount}
          </span>
        )}
      </Button>

      <dialog
        ref={ref}
        aria-label="Filters"
        onClick={(e) => {
          if (e.target === ref.current) ref.current.close();
        }}
        className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[80dvh] w-full max-w-none overflow-y-auto rounded-t-[16px] bg-surface p-0 text-ink shadow-sheet backdrop:bg-scrim"
      >
        <div className="flex items-center justify-between border-b border-line px-(--gutter) py-3">
          <h2 className="text-[1.0625rem]">Filters</h2>
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => ref.current?.close()}
            className="flex size-11 items-center justify-center rounded-md text-ink-muted hover:text-herb"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="px-(--gutter) pt-4">{children}</div>
        <div className="sticky bottom-0 border-t border-line bg-surface px-(--gutter) py-3">
          <Button size="lg" className="w-full" onClick={() => ref.current?.close()}>
            {showLabel}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
