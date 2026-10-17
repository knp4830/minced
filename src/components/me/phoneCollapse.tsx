"use client";

import { useId, useState, type ReactNode } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Collapsed by default on a phone, always open from md up. The content is server-rendered and passed in as
 * children; only the toggle is client code. The button is hidden from md up, so a desktop reader never sees
 * a control that does nothing.
 */
export function PhoneCollapse({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-between rounded-md border border-line-strong px-3.5 text-[0.875rem] font-medium text-herb transition-colors hover:bg-band md:hidden"
      >
        {open ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      <div id={id} className={cn(!open && "max-md:hidden")}>
        {children}
      </div>
    </>
  );
}
