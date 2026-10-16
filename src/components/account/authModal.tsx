"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * The sign-in screens as a dialog over the current page. A native <dialog>
 * opened with showModal(): focus moves in and stays in (focus trap), Escape
 * closes it, and the page behind is inert. Closing goes back in history, which
 * is the page the visitor was on. Focus returns to whatever opened it.
 *
 * When a form succeeds the server action redirects, the slot empties and this
 * unmounts while still open; the cleanup restores focus in that case too.
 */
export function AuthModal({ children }: { children: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Read once: React Strict Mode runs this effect twice in development.
    openerRef.current ??= document.activeElement as HTMLElement | null;
    const opener = openerRef.current;
    const d = ref.current;
    if (d && !d.open) {
      d.showModal();
      // showModal() focuses the first focusable thing, which is Close. Land in the form instead.
      d.querySelector<HTMLElement>("input:not([type=hidden]):not([disabled])")?.focus({ preventScroll: true });
    }
    // Esc, the X and a backdrop click all end in the dialog's own "close" event.
    const onClose = () => router.back();
    d?.addEventListener("close", onClose);
    return () => {
      d?.removeEventListener("close", onClose);
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [router]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="auth-title"
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // the backdrop
      }}
      className="m-auto max-h-[calc(100dvh-1.5rem)] w-[min(calc(100vw-1.5rem),26rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-0 text-ink shadow-frame backdrop:bg-scrim backdrop:backdrop-blur-[2px]"
    >
      <div className="relative px-6 pt-8 pb-6 sm:px-8">
        <button
          type="button"
          aria-label="Close"
          onClick={() => ref.current?.close()}
          className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-md text-ink-muted hover:text-herb"
        >
          <X aria-hidden className="size-5" />
        </button>
        {children}
      </div>
    </dialog>
  );
}
