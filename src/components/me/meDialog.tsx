"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { X } from "lucide-react";

/*
 * A modal dialog for the Me sheets. The native <dialog> gives the focus trap, Escape, the inert background
 * and focus return for free; polish.css locks page scroll behind any `dialog:modal`. It is mounted only
 * while open, so each opening starts from fresh state. Centered card from md up, bottom sheet on a phone
 * (styles in me.css).
 */
export function MeDialog({
  eyebrow,
  title,
  onClose,
  children,
  widthRem,
  closeLabel = "Close",
}: {
  eyebrow?: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Desktop width in rem (default 47.5). */
  widthRem?: number;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    // React's `autoFocus` runs while this dialog is still closed, so it never takes. Once the dialog is open, put
    // the cursor in its search / name field (otherwise it lands on the close button and typing goes nowhere).
    el?.querySelector<HTMLElement>('input[type="search"], input[role="combobox"]')?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="me-dialog me-scope"
      style={widthRem ? ({ "--me-dialog-w": `${widthRem}rem` } as React.CSSProperties) : undefined}
      onClose={onClose}
      onClick={(e) => {
        // Only the backdrop itself is the dialog element; clicks inside land on children.
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="p-5 md:px-7 md:py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            {eyebrow && <p className="label-mono">{eyebrow}</p>}
            <h2 id={titleId} className="mt-1.5 text-[1.375rem] leading-tight font-medium md:text-2xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => ref.current?.close()}
            className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-band hover:text-ink sm:size-9 pointer-coarse:size-11"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
