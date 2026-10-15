"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { reviewHref } from "@/components/admin/reviewFilters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { setReview, updateRecipe } from "@/lib/actions/adminReview";
import { SOURCE_LABEL, type AdminRecipe, type ReviewState, type SourceKey } from "@/lib/adminReviewShared";
import { cn } from "@/lib/utils";

/*
 * One recipe per screen. Client-side because it owns keyboard shortcuts, the
 * edit form and the undo bar; every piece of data arrives as props from the
 * server page, and every write goes through a Server Action.
 *
 * Shortcuts (ignored while typing in a field):
 *   J / ArrowRight  next      K / ArrowLeft  previous
 *   A approve + next          X reject + next       U undo last
 *   E edit (Esc cancels, Ctrl/Cmd+Enter saves)
 */

/* Phones: five equal buttons in one row (the shortcut hints are keyboard-only). */
const BAR_BTN = "flex-1 px-1.5 md:flex-none md:px-3.5";

const STATUS_STYLE = {
  approved: "border-herb bg-herb text-on-herb",
  rejected: "border-paprika bg-paprika-deep text-on-herb",
  unreviewed: "border-line-strong bg-surface text-ink-muted",
} as const;

export function fmtQty(q: number | null): string {
  if (q === null || q === undefined) return "";
  return String(Number(Number(q).toFixed(3)));
}

type Undo = { slug: string; title: string; label: string };

export function ReviewScreen({
  recipe,
  state,
  source,
  prev,
  next,
  total,
  photoUrl,
}: {
  recipe: AdminRecipe;
  state: ReviewState;
  source: SourceKey | null;
  prev: string | null;
  next: string | null;
  total: number;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [lastSlug, setLastSlug] = useState(recipe.slug);
  const busy = useRef(false);

  // New recipe on screen: leave edit mode and clear the per-recipe note.
  // (Adjusting state during render is React's documented alternative to an effect.)
  if (lastSlug !== recipe.slug) {
    setLastSlug(recipe.slug);
    setEditing(false);
    setNote(recipe.review?.note ?? "");
    setMessage(null);
  }

  const href = useCallback((slug: string | null) => reviewHref("/admin/review", state, source, slug), [state, source]);
  // A Server Action's response can carry a refresh of the current route, and
  // that can land after (and cancel) the push below. The watchdog re-issues
  // the navigation if the URL has not moved, so A / X / U never silently stall.
  const go = useCallback(
    (slug: string | null) => {
      const target = href(slug);
      startTransition(() => router.push(target));
      if (!slug) return;
      window.setTimeout(() => {
        if (window.location.pathname + window.location.search !== target) {
          startTransition(() => router.push(target));
        }
      }, 1200);
    },
    [router, href],
  );

  const act = useCallback(
    async (to: "approved" | "rejected") => {
      if (busy.current) return;
      busy.current = true;
      setMessage(null);
      const res = await setReview([recipe.slug], to, note || undefined);
      busy.current = false;
      if (!res.ok) {
        setMessage(res.reason === "forbidden" ? "Not allowed: your account is not an admin." : (res.message ?? "That did not save. Try again."));
        return;
      }
      setUndo({ slug: recipe.slug, title: recipe.title, label: to === "approved" ? "Approved" : "Rejected" });
      setNote("");
      // Moving on from the recipe just reviewed; `next` is relative to it, so
      // it is still right even though it has now left an "unreviewed" filter.
      if (next) go(next);
      else if (prev && state !== "unreviewed") go(prev);
      else go(null);
    },
    [recipe.slug, recipe.title, note, next, prev, state, go],
  );

  const undoLast = useCallback(async () => {
    if (!undo || busy.current) return;
    busy.current = true;
    const res = await setReview([undo.slug], "unreviewed");
    busy.current = false;
    if (!res.ok) {
      setMessage(res.message ?? "Undo failed.");
      return;
    }
    const slug = undo.slug;
    setUndo(null);
    go(slug);
  }, [undo, go]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (editing) return;
      switch (e.key.toLowerCase()) {
        case "j":
        case "arrowright":
          if (next) go(next);
          break;
        case "k":
        case "arrowleft":
          if (prev) go(prev);
          break;
        case "a":
          void act("approved");
          break;
        case "x":
          void act("rejected");
          break;
        case "e":
          e.preventDefault();
          setEditing(true);
          break;
        case "u":
          void undoLast();
          break;
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, next, prev, go, act, undoLast]);

  const r = recipe;
  const reviewState = r.review?.state ?? "unreviewed";
  const n = r.nutrition;
  const sourceKey = r.source.key;

  return (
    <article className="mt-5" aria-busy={pending}>
      {/* Action bar: bottom of the screen on phones, sticky at the top on desktop. */}
      <div
        role="toolbar"
        aria-label="Review actions"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line-strong bg-surface px-(--gutter) py-2 md:sticky md:top-0 md:inset-x-auto md:rounded-xl md:border md:px-3"
      >
        <div className="flex items-center gap-1.5 md:flex-wrap md:gap-2">
          <Button variant="secondary" size="sm" className={BAR_BTN} onClick={() => prev && go(prev)} disabled={!prev || pending} aria-keyshortcuts="K">
            Prev <kbd className="hidden font-mono text-xs md:inline text-ink-subtle">K</kbd>
          </Button>
          <Button
            size="sm"
            className={BAR_BTN}
            onClick={() => void act("approved")}
            disabled={pending || editing}
            aria-keyshortcuts="A"
          >
            Approve <kbd className="hidden font-mono text-xs md:inline opacity-80">A</kbd>
          </Button>
          <Button
            variant="danger"
            size="sm"
            className={BAR_BTN}
            onClick={() => void act("rejected")}
            disabled={pending || editing}
            aria-keyshortcuts="X"
          >
            Reject <kbd className="hidden font-mono text-xs md:inline opacity-80">X</kbd>
          </Button>
          <Button variant="secondary" size="sm" className={BAR_BTN} onClick={() => setEditing((v) => !v)} aria-pressed={editing} aria-keyshortcuts="E">
            Edit <kbd className="hidden font-mono text-xs md:inline text-ink-subtle">E</kbd>
          </Button>
          <Button variant="secondary" size="sm" className={BAR_BTN} onClick={() => next && go(next)} disabled={!next || pending} aria-keyshortcuts="J">
            Next <kbd className="hidden font-mono text-xs md:inline text-ink-subtle">J</kbd>
          </Button>
          <span className="ml-auto hidden font-mono text-[0.75rem] text-ink-muted md:inline">
            {total} in this view
          </span>
        </div>
      </div>

      <div role="status" aria-live="polite" className="mt-3 min-h-6 text-[0.875rem]">
        {message && <span className="font-medium text-paprika-deep">{message}</span>}
        {!message && undo && (
          <span>
            {undo.label} <span className="font-medium">{undo.title}</span>.{" "}
            <button type="button" onClick={() => void undoLast()} className="font-medium text-herb underline underline-offset-2">
              Undo (U)
            </button>
          </span>
        )}
      </div>

      <header className="mt-1 flex flex-wrap items-start gap-x-3 gap-y-2">
        <h1 className="text-[1.5rem] leading-tight md:text-[2rem]" data-testid="recipe-title">
          {r.title}
        </h1>
        <span
          className={cn("mt-1.5 rounded-sheet border px-2.5 py-1 text-[0.75rem] font-semibold", STATUS_STYLE[reviewState])}
          data-testid="review-state"
        >
          {reviewState}
        </span>
        {r.status !== "published" && (
          <span className="mt-1.5 rounded-sheet border border-line-strong px-2.5 py-1 text-[0.75rem] text-ink-muted">
            hidden from the public ({r.status})
          </span>
        )}
      </header>
      <p className="mt-1 font-mono text-[0.8125rem] text-ink-muted">
        {r.slug} &middot; serves {r.servings}
        {r.prep_time_min !== null || r.cook_time_min !== null
          ? ` · ${r.prep_time_min ?? 0} prep + ${r.cook_time_min ?? 0} cook min`
          : " · no time data"}
        {r.cuisine ? ` · ${r.cuisine}` : ""}
      </p>

      {editing ? (
        <EditForm
          key={r.slug}
          recipe={r}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setMessage(null);
            router.refresh();
          }}
        />
      ) : (
        <div className="mt-5 grid gap-x-10 gap-y-7 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="space-y-6">
            <section aria-labelledby="ing-h">
              <h2 id="ing-h" className="text-[1.125rem]">
                Ingredients <span className="font-sans text-[0.8125rem] font-normal text-ink-muted">as resolved</span>
              </h2>
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line-strong bg-surface" data-testid="ingredients">
                {r.ingredients.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3.5 py-2.5">
                    <span className="min-w-[4.5rem] font-mono text-[0.875rem] text-ink-soft">
                      {fmtQty(i.quantity) || "to taste"} {i.unit ?? ""}
                    </span>
                    <span className="text-[1rem] font-semibold">{i.canonical_name}</span>
                    {i.prep_note && <span className="text-[0.875rem] text-ink-muted">{i.prep_note}</span>}
                    {i.is_optional && <span className="text-[0.75rem] text-ink-subtle">optional</span>}
                    {i.is_pantry_staple && (
                      <span className="rounded-sheet border border-line-strong px-2 text-[0.6875rem] text-ink-muted">staple</span>
                    )}
                  </li>
                ))}
                {r.ingredients.length === 0 && <li className="px-3.5 py-2.5 text-paprika-deep">No ingredients.</li>}
              </ul>
            </section>

            <section aria-labelledby="photo-h">
              <h2 id="photo-h" className="text-[1.125rem]">
                Photo
              </h2>
              {r.photo && photoUrl ? (
                <figure className="mt-2">
                  {/* Remote Storage host: plain img (see recipe page). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt={r.photo.alt_text ?? `Photo of ${r.title}`}
                    width={r.photo.width}
                    height={r.photo.height}
                    className="max-h-80 w-full rounded-xl border border-line object-cover"
                  />
                  <figcaption className="mt-1.5 text-[0.8125rem] text-ink-muted">
                    {r.photo.license}
                    {r.photo.credit ? ` · ${r.photo.credit}` : ""} &middot;{" "}
                    <a className="text-herb underline" href={r.photo.attribution_url} target="_blank" rel="noopener noreferrer">
                      source page
                    </a>
                  </figcaption>
                </figure>
              ) : (
                <p className="mt-2 text-[0.875rem] text-ink-muted">No photo (the public page shows the colour-block placeholder).</p>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section aria-labelledby="steps-h">
              <h2 id="steps-h" className="text-[1.125rem]">
                Steps
              </h2>
              <ol className="mt-2 space-y-2.5" data-testid="steps">
                {r.steps.map((s, idx) => (
                  <li key={s.id} className="flex gap-3 text-[0.9375rem] leading-relaxed">
                    <span className="font-mono text-[0.8125rem] text-ink-subtle">{idx + 1}</span>
                    <span>{s.instruction}</span>
                  </li>
                ))}
                {r.steps.length === 0 && <li className="text-paprika-deep">No steps.</li>}
              </ol>
            </section>

            <section aria-labelledby="facts-h" className="rounded-xl border border-line-strong bg-surface p-4">
              <h2 id="facts-h" className="text-[1.125rem]">
                Nutrition, allergens, source
              </h2>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 font-mono text-[0.8125rem]">
                {(
                  [
                    ["kcal", n.calories],
                    ["protein g", n.protein_g],
                    ["carbs g", n.carbs_g],
                    ["fat g", n.fat_g],
                    ["sodium mg", n.sodium_mg],
                    ["fiber g", n.fiber_g],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label}>
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="text-[0.9375rem] font-medium">{v === null ? "none" : Math.round(Number(v) * 10) / 10}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-[0.75rem] text-ink-muted">Per serving.</p>
              <p className="mt-3 text-[0.875rem]">
                <span className="font-semibold">Allergens:</span> {r.allergens.length ? r.allergens.join(", ") : "none recorded"}
              </p>
              {r.diets.length > 0 && (
                <p className="mt-1 text-[0.875rem]">
                  <span className="font-semibold">Diets:</span> {r.diets.join(", ")}
                </p>
              )}
              {r.cookware.length > 0 && (
                <p className="mt-1 text-[0.875rem]">
                  <span className="font-semibold">Cookware:</span> {r.cookware.join(", ")}
                </p>
              )}
              <p className="mt-3 text-[0.875rem]">
                <span className="font-semibold">Source:</span> {SOURCE_LABEL[sourceKey]}
                {r.source.name ? ` (${r.source.name})` : ""}
              </p>
              {r.source.license && <p className="text-[0.8125rem] text-ink-muted">{r.source.license}</p>}
              {sourceKey === "user" && (
                <p className="mt-1 text-[0.8125rem] text-ink-muted">
                  Written by a signed-in cook. Reject sends it back to them as a draft and shows them your note;
                  approve publishes it. Check the diet tags against the ingredients and look for copied text.
                </p>
              )}
              {r.source.url && (
                <p className="mt-1 text-[0.8125rem] break-all">
                  <a className="text-herb underline" href={r.source.url} target="_blank" rel="noopener noreferrer">
                    {r.source.url}
                  </a>
                </p>
              )}
            </section>

            <section aria-labelledby="note-h">
              <h2 id="note-h" className="text-[1.125rem]">
                Review note
              </h2>
              <label htmlFor="review-note" className="sr-only">
                Review note, saved with the next approve or reject
              </label>
              <Input
                id="review-note"
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
                placeholder={r.review?.note ? undefined : "Optional. Saved with the next approve or reject."}
                className="mt-2"
              />
              {r.review?.note && <p className="mt-1 text-[0.8125rem] text-ink-muted">Saved note: {r.review.note}</p>}
            </section>
          </div>
        </div>
      )}

      <details className="mt-8 text-[0.8125rem] text-ink-muted">
        <summary className="cursor-pointer font-medium">Keyboard shortcuts</summary>
        <p className="mt-1.5 font-mono leading-relaxed">
          J / K next, previous &middot; A approve &middot; X reject &middot; E edit &middot; U undo &middot; Esc leave
          edit &middot; Ctrl+Enter save edit
        </p>
      </details>
    </article>
  );
}

/* ------------------------------------------------------------------------ */

function EditForm({ recipe, onCancel, onSaved }: { recipe: AdminRecipe; onCancel: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(recipe.title);
  const [steps, setSteps] = useState(recipe.steps.map((s) => s.instruction));
  const [qty, setQty] = useState(recipe.ingredients.map((i) => fmtQty(i.quantity)));
  const [prep, setPrep] = useState(recipe.ingredients.map((i) => i.prep_note ?? ""));
  const [swap, setSwap] = useState(recipe.ingredients.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => firstRef.current?.focus(), []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const edit = {
      title: title !== recipe.title ? title : undefined,
      steps: recipe.steps.flatMap((s, i) => (steps[i] !== s.instruction ? [{ id: s.id, instruction: steps[i] }] : [])),
      ingredients: recipe.ingredients.flatMap((ing, i) =>
        qty[i] !== fmtQty(ing.quantity) || prep[i] !== (ing.prep_note ?? "") || swap[i].trim() !== ""
          ? [
              {
                id: ing.id,
                // The field shows a 3-decimal rounding. If it was not edited, send the
                // stored value untouched so a prep-note edit cannot rewrite 1/3 as 0.333.
                quantity: qty[i] === fmtQty(ing.quantity) ? (ing.quantity === null ? "" : String(ing.quantity)) : qty[i],
                prep_note: prep[i],
                ingredient_name: swap[i],
              },
            ]
          : [],
      ),
    };
    if (edit.title === undefined && edit.steps.length === 0 && edit.ingredients.length === 0) {
      setSaving(false);
      onCancel();
      return;
    }
    const res = await updateRecipe(recipe.slug, edit);
    setSaving(false);
    if (res.ok) onSaved();
    else setError(res.message ?? (res.reason === "forbidden" ? "Not allowed." : "That did not save."));
  }

  return (
    <form
      ref={formRef}
      className="mt-5 space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <div>
        <label htmlFor="e-title" className="text-[0.875rem] font-semibold">
          Title
        </label>
        <Input id="e-title" ref={firstRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="mt-1" />
      </div>

      <fieldset>
        <legend className="text-[1.125rem] font-semibold">Ingredients</legend>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          Quantity empty means to taste. To change which ingredient a line is, type its name in &ldquo;Swap to&rdquo;; it must
          resolve to a canonical ingredient or the save is refused.
        </p>
        <ul className="mt-2 space-y-3">
          {recipe.ingredients.map((ing, i) => (
            <li key={ing.id} className="rounded-xl border border-line-strong bg-surface p-3">
              <p className="text-[0.9375rem] font-semibold">
                {ing.canonical_name} <span className="font-mono text-[0.75rem] font-normal text-ink-muted">{ing.unit ?? "no unit"}</span>
              </p>
              <div className="mt-2 grid grid-cols-[6rem_1fr] gap-2 sm:grid-cols-[6rem_1fr_1fr]">
                <div>
                  <label htmlFor={`q-${ing.id}`} className="text-[0.75rem] text-ink-muted">
                    Quantity
                  </label>
                  <Input
                    id={`q-${ing.id}`}
                    mono
                    inputMode="decimal"
                    value={qty[i]}
                    onChange={(e) => setQty((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  />
                </div>
                <div>
                  <label htmlFor={`p-${ing.id}`} className="text-[0.75rem] text-ink-muted">
                    Prep note
                  </label>
                  <Input
                    id={`p-${ing.id}`}
                    value={prep[i]}
                    maxLength={200}
                    onChange={(e) => setPrep((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor={`s-${ing.id}`} className="text-[0.75rem] text-ink-muted">
                    Swap to (optional)
                  </label>
                  <Input
                    id={`s-${ing.id}`}
                    value={swap[i]}
                    placeholder="canonical name"
                    onChange={(e) => setSwap((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-[1.125rem] font-semibold">Steps</legend>
        <ol className="mt-2 space-y-3">
          {recipe.steps.map((s, i) => (
            <li key={s.id}>
              <label htmlFor={`st-${s.id}`} className="text-[0.75rem] text-ink-muted">
                Step {i + 1}
              </label>
              <Textarea
                id={`st-${s.id}`}
                value={steps[i]}
                rows={3}
                maxLength={2000}
                onChange={(e) => setSteps((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
              />
            </li>
          ))}
        </ol>
      </fieldset>

      <div role="alert" className="min-h-6 text-[0.875rem] font-medium text-paprika-deep">
        {error}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving" : "Save changes"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
