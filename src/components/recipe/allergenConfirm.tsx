"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { listNames } from "@/lib/listNames";

/*
 * The confirm step in front of anything that lets a saved allergen through.
 *
 * Saved allergens are a safety setting, so lifting one is never a single tap: it always passes through this
 * dialog, and the safe answer ("keep them hidden") is the one that holds focus when it opens. Built on the native
 * <dialog> + showModal(), which gives the focus trap, the inert page behind it, Escape to cancel, and focus
 * returning to the button that opened it. A click on the backdrop and Escape both mean "keep them hidden".
 */

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** The risky answer. */
  confirmLabel: string;
  /** The safe answer; it holds focus on open. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const decided = useRef(false);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      decided.current = false;
      d.showModal();
      cancelRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      onClose={() => {
        if (!decided.current) onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(calc(100vw-2rem),28rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-sheet backdrop:bg-scrim"
    >
      {/* Padding lives on this wrapper, not the <dialog>, so a click on it is not read as a backdrop click. */}
      <div className="p-5">
        <h2 id={`${id}-title`} className="text-[1.0625rem] leading-snug">
          {title}
        </h2>
        <div id={`${id}-desc`} className="mt-2 space-y-2 text-[0.875rem] leading-snug text-ink-soft">
          {children}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2.5">
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              decided.current = true;
              onConfirm();
              ref.current?.close();
            }}
          >
            {confirmLabel}
          </Button>
          <Button
            ref={cancelRef}
            type="button"
            variant="primary"
            onClick={() => {
              decided.current = true;
              onCancel();
              ref.current?.close();
            }}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * "Show recipes with my allergens": a button that asks first, then goes to `href` (the same search with
 * `showAllergens=1`). Nothing is saved; the choice lives in that one URL.
 */
export function ShowAllergensButton({
  href,
  names,
  className,
}: {
  href: string;
  /** Display names of the saved allergens, lower case ("peanuts"). */
  names: string[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const list = listNames(names);
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Show recipes with my allergens
      </button>
      <ConfirmDialog
        open={open}
        title={`These recipes may contain ${list}. Show them?`}
        confirmLabel="Show them for this search"
        cancelLabel="Keep them hidden"
        onConfirm={() => {
          setOpen(false);
          router.push(href, { scroll: false });
        }}
        onCancel={() => setOpen(false)}
      >
        <p>
          You asked us to keep {list} out of your results. We will show them for this search only, and hide them again
          next time.
        </p>
        <p>
          Allergen information comes from the ingredients listed and can miss brands and cross-contact, so always read
          labels.
        </p>
      </ConfirmDialog>
    </>
  );
}
