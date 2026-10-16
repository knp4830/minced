"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import "@/components/me/me.css";

import { ClipboardPlus } from "lucide-react";

import { useAccount } from "@/components/account/accountProvider";
import { MeDialog } from "@/components/me/meDialog";
import { Button } from "@/components/ui/button";
import { logFood } from "@/lib/actions/me";
import { todayInZone } from "@/lib/me/dates";
import { ME_ENABLED } from "@/lib/me/flag";
import { MEALS, type Meal } from "@/lib/me/types";
import { cn } from "@/lib/utils";

/*
 * "Log this" on a recipe page, for signed-in people only (and only while the Me flag is on). The recipe
 * page itself stays cached and identical for everyone: this island decides on the client, from the same
 * session the rest of the site uses, whether to show itself. Choosing a meal and servings writes the
 * recipe's per-serving nutrition, frozen, to today's food on /me.
 */

function defaultMeal(): Meal {
  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
}

export function LogThisButton({ slug, title, hasNutrition }: { slug: string; title: string; hasNutrition: boolean }) {
  const { status } = useAccount();
  const [open, setOpen] = useState(false);
  if (!ME_ENABLED || status !== "in" || !hasNutrition) return null;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <ClipboardPlus aria-hidden className="size-4" />
        Log this
      </Button>
      {open && <LogDialog slug={slug} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

function LogDialog({ slug, title, onClose }: { slug: string; title: string; onClose: () => void }) {
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [servings, setServings] = useState(1);
  const [done, setDone] = useState<Meal | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    setMessage(null);
    start(async () => {
      let zone: string | undefined;
      try {
        zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        zone = undefined;
      }
      const r = await logFood({ kind: "recipe", date: todayInZone(zone), meal, slug, servings });
      if (r.ok) setDone(meal);
      else setMessage(r.error);
    });
  }

  return (
    <MeDialog eyebrow="Log this" title={title} onClose={onClose} widthRem={30}>
      {done ? (
        <div role="status">
          <p className="mt-4 text-[0.9375rem]">
            Added to {MEALS.find((m) => m.v === done)?.label.toLowerCase()} on today&rsquo;s page.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Done
            </Button>
            <Button size="sm" asChild>
              <Link href="/me">Open Me</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Meal" className="mt-4 flex flex-wrap gap-1.5">
            {MEALS.map((m) => (
              <button
                key={m.v}
                type="button"
                role="radio"
                aria-checked={meal === m.v}
                onClick={() => setMeal(m.v)}
                className={cn(
                  "min-h-9 rounded-sheet border px-3.5 text-[0.8125rem] font-medium transition-colors pointer-coarse:min-h-11",
                  meal === m.v ? "border-herb bg-herb text-on-herb" : "border-line-strong text-ink hover:border-herb hover:text-herb",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <span id="me-log-servings" className="text-[0.8125rem] font-semibold">
              Servings eaten
            </span>
            <div className="inline-flex items-center rounded-field border border-field" role="group" aria-labelledby="me-log-servings">
              <button type="button" aria-label="Fewer servings" disabled={servings <= 0.5} onClick={() => setServings((s) => Math.max(0.5, s - 0.5))} className="size-11 text-lg text-herb disabled:opacity-40 sm:size-10">
                &minus;
              </button>
              <output className="min-w-12 text-center font-mono text-[0.9375rem]" aria-live="polite">
                {servings}
              </output>
              <button type="button" aria-label="More servings" disabled={servings >= 20} onClick={() => setServings((s) => Math.min(20, s + 0.5))} className="size-11 text-lg text-herb disabled:opacity-40 sm:size-10">
                +
              </button>
            </div>
          </div>
          <p role="alert" className={cn("mt-3 text-[0.8125rem] text-paprika-deep", !message && "sr-only")}>
            {message}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={add} disabled={pending}>
              {pending ? "Adding…" : "Add to my day"}
            </Button>
          </div>
        </>
      )}
    </MeDialog>
  );
}
