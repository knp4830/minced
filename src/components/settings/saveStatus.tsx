"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { SaveResult } from "@/lib/actions/settings";

/*
 * Autosave plumbing shared by every Settings section.
 *
 *  - ONE status line per section, always in the DOM (`role="status"`), empty on first render so nothing is
 *    announced on load. "Saving..." appears only after 400 ms (no flicker for a fast save), "Saved." stays 3 s.
 *  - Saves are serialised: one in flight at a time, and while it runs only the LATEST value is kept, so a
 *    flurry of taps becomes at most two requests and the last write wins.
 *  - A failed save reverts the control to the last value the server confirmed, so the page never shows a
 *    choice that was not stored.
 */

export type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string; signedOut: boolean };

const SHOW_SAVING_AFTER_MS = 400;
const SAVED_FOR_MS = 3000;

const FAILED: SaveResult = { ok: false, reason: "failed", message: "Couldn't save that just now. Try again." };
const OFFLINE: SaveResult = { ok: false, reason: "failed", message: "You're offline. Your change wasn't saved." };

export function useSaveStatus() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const show = useRef<number | undefined>(undefined);
  const clear = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(show.current);
      window.clearTimeout(clear.current);
    },
    [],
  );

  /** Runs one save and reflects it in the status line. Never throws. */
  const run = useCallback(async (fn: () => Promise<SaveResult>): Promise<SaveResult> => {
    window.clearTimeout(clear.current);
    window.clearTimeout(show.current);
    show.current = window.setTimeout(() => setStatus({ kind: "saving" }), SHOW_SAVING_AFTER_MS);
    let result: SaveResult;
    try {
      result = await fn();
    } catch {
      result = typeof navigator !== "undefined" && navigator.onLine === false ? OFFLINE : FAILED;
    }
    window.clearTimeout(show.current);
    if (result.ok) {
      setStatus({ kind: "saved" });
      clear.current = window.setTimeout(() => setStatus({ kind: "idle" }), SAVED_FOR_MS);
    } else {
      setStatus({ kind: "error", message: result.message, signedOut: result.reason === "signed-out" });
    }
    return result;
  }, []);

  return { status, run };
}

/**
 * One value that autosaves. `set` updates the screen at once and queues a save; `value` is what the screen
 * shows; a failed save puts back the last confirmed value.
 */
export function useAutosave<T>(
  initial: T,
  save: (value: T) => Promise<SaveResult>,
  run: (fn: () => Promise<SaveResult>) => Promise<SaveResult>,
  onSaved?: (value: T, result: SaveResult) => void,
) {
  const [value, setValue] = useState<T>(initial);
  const confirmed = useRef<T>(initial);
  const latest = useRef<{ v: T } | null>(null);
  const inFlight = useRef(false);
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const set = useCallback(
    async (next: T) => {
      setValue(next);
      latest.current = { v: next };
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        while (latest.current) {
          const { v } = latest.current;
          latest.current = null;
          const r = await run(() => saveRef.current(v));
          if (r.ok) {
            confirmed.current = v;
            onSavedRef.current?.(v, r);
          } else if (!latest.current) {
            setValue(confirmed.current);
          }
        }
      } finally {
        inFlight.current = false;
      }
    },
    [run],
  );

  return [value, set] as const;
}

/** The section's status line. Always rendered, so screen readers announce changes to it. */
export function StatusLine({ status }: { status: Status }) {
  return (
    <p role="status" aria-live="polite" className="mt-2 min-h-5 text-[0.8125rem] text-ink-muted">
      {status.kind === "saving" && "Saving…"}
      {status.kind === "saved" && "Saved."}
      {status.kind === "error" && (
        <span className="text-paprika-deep">
          {status.message}
          {status.signedOut && (
            <>
              {" "}
              <Link href="/login?next=%2Fsettings" className="underline underline-offset-4">
                Log in
              </Link>
            </>
          )}
        </span>
      )}
    </p>
  );
}
