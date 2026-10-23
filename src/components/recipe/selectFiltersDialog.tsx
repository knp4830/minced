"use client";

import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";

import { startNavProgress } from "@/components/shell/navProgress";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { filtersToQuery, toggleInList, type RecipeFilters } from "@/lib/filters";
import type { FilterOptions } from "@/lib/queries/browse";
import type { CatalogItem, IngredientCatalog } from "@/lib/queries/ingredientCatalog";
import { cn } from "@/lib/utils";

/**
 * The landing page's "Select filters": one pop-up where a visitor says what they want in the meal, then
 * "Show recipes" opens /recipes with those choices as URL params. It builds a RecipeFilters and serialises it
 * with the shared contract (src/lib/filters.ts), so the results page reads it exactly as it reads any other
 * link. Works signed out; nothing is saved. The choices are a draft: closing the pop-up throws them away.
 *
 * A native <dialog> gives the focus trap, Escape and an inert background; focus goes back to the button on
 * close. It is a bottom sheet on phones and a centred panel from md up.
 */

const TIME = [
  { label: "Under 15", min: undefined, max: 15 },
  { label: "15–30", min: 15, max: 30 },
  { label: "30–60", min: 30, max: 60 },
  { label: "Over 60", min: 60, max: undefined },
] as const;
const CALORIES = [
  { label: "Under 400", max: 400 },
  { label: "Under 600", max: 600 },
  { label: "Under 800", max: 800 },
] as const;
const PROTEIN = [20, 30, 40] as const;
const TOP_N = 14;
const FIND_LIMIT = 30;

type Draft = RecipeFilters;

export function SelectFiltersDialog({
  catalog,
  options,
}: {
  catalog: IngredientCatalog;
  options: Pick<FilterOptions, "diets" | "allergens">;
}) {
  const router = useRouter();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [aisle, setAisle] = useState(catalog.categories[0]?.name ?? "");
  const [query, setQuery] = useState("");

  const picked = draft.include ?? [];
  const finding = query.trim().toLowerCase();

  const found = useMemo(() => {
    if (!finding) return [];
    const stem = finding.replace(/(ies|es|s)$/, "");
    const needles = stem.length >= 3 && stem !== finding ? [finding, stem] : [finding];
    const atWord = (t: string, n: string) => t.startsWith(n) || t.includes(` ${n}`) || t.includes(`-${n}`);
    const rank = (i: CatalogItem): number => {
      const name = i.name.toLowerCase();
      if (needles.some((n) => name.startsWith(n))) return 0;
      if (needles.some((n) => atWord(name, n))) return 1;
      return i.aka?.split("|").some((s) => needles.some((n) => atWord(s.toLowerCase(), n))) ? 2 : 3;
    };
    return catalog.categories
      .flatMap((c) => c.items)
      .map((i) => ({ i, r: rank(i) }))
      .filter((x) => x.r < 3)
      .sort((a, b) => a.r - b.r || b.i.uses - a.i.uses)
      .map((x) => x.i)
      .slice(0, FIND_LIMIT);
  }, [catalog, finding]);

  const category = catalog.categories.find((c) => c.name === aisle) ?? catalog.categories[0];
  const shown = finding ? found : (category?.items ?? []).slice(0, TOP_N);

  function open() {
    setDraft({});
    setQuery("");
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
    openerRef.current?.focus();
  }
  function toggleIngredient(item: CatalogItem) {
    setNames((n) => ({ ...n, [item.id]: item.name }));
    setDraft((d) => {
      const cur = d.include ?? [];
      return { ...d, include: cur.includes(item.id) ? cur.filter((x) => x !== item.id) : [...cur, item.id] };
    });
  }
  const toggleList = (key: "diet" | "exclude", slug: string) =>
    setDraft((d) => toggleInList(d, key, slug));

  function show(e: React.FormEvent) {
    e.preventDefault();
    dialogRef.current?.close();
    startNavProgress();
    router.push(`/recipes${filtersToQuery({ ...draft, include: picked.length ? picked : undefined })}`);
  }

  const count =
    picked.length +
    (draft.diet?.length ?? 0) +
    (draft.exclude?.length ?? 0) +
    (draft.minTime !== undefined || draft.maxTime !== undefined ? 1 : 0) +
    (draft.calMax !== undefined ? 1 : 0) +
    (draft.proteinMin !== undefined ? 1 : 0);

  const legend = "label-mono mb-2.5";

  return (
    <>
      <Button
        ref={openerRef}
        variant="secondary"
        size="lg"
        aria-haspopup="dialog"
        onClick={open}
        className="w-full sm:w-auto"
      >
        <SlidersHorizontal aria-hidden className="size-[18px]" />
        Select filters
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-title`}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        onCancel={() => openerRef.current?.focus()}
        className={cn(
          "fixed inset-x-0 top-auto bottom-0 m-0 h-[90dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[16px] bg-surface p-0 text-ink shadow-sheet backdrop:bg-scrim open:flex",
          "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:h-[40rem] md:max-h-[88dvh] md:w-[44rem] md:max-w-[calc(100vw-3rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-frame",
        )}
      >
        <form onSubmit={show} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-(--gutter) py-3">
            <h2 id={`${uid}-title`} className="text-[1.0625rem] md:text-[1.25rem]">
              What do you want in your meal?
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="-mr-2 flex size-11 items-center justify-center rounded-md text-ink-muted hover:text-herb"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-(--gutter) pt-4 pb-3">
            <p className="mb-4 text-[0.875rem] leading-snug text-ink-muted">
              Choose as much or as little as you like. You’ll see recipes that fit, and nothing here is saved. If you have allergens saved in Settings, they still apply on the results page.
            </p>

            <fieldset className="mb-6 min-w-0">
              <legend className={legend}>Ingredients to include</legend>
              {picked.length > 0 && (
                <ul aria-label="Chosen ingredients" className="mb-3 flex flex-wrap gap-1.5">
                  {picked.map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        aria-label={`Remove ${names[id] ?? "ingredient"}`}
                        onClick={() =>
                          setDraft((d) => ({ ...d, include: (d.include ?? []).filter((x) => x !== id) }))
                        }
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-sheet border border-herb bg-herb py-1 pr-2 pl-3 text-[0.8125rem] font-medium text-on-herb hover:bg-herb-deep pointer-coarse:min-h-11"
                      >
                        {names[id] ?? "Ingredient"}
                        <X aria-hidden className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex min-h-11 items-center gap-2 rounded-field border border-line bg-sunken px-3 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20">
                <Search aria-hidden className="size-4 shrink-0 text-stone" />
                <label htmlFor={`${uid}-find`} className="sr-only">
                  Find an ingredient
                </label>
                <input
                  id={`${uid}-find`}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter in the find box must not submit the whole form. It picks the first match, if any.
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const first = finding ? found[0] : undefined;
                    if (first && !picked.includes(first.id)) {
                      toggleIngredient(first);
                      setQuery("");
                    }
                  }}
                  placeholder="Find an ingredient"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle sm:text-sm"
                />
              </div>
              {!finding && (
                <div role="group" aria-label="Aisles" className="mt-2.5 flex flex-wrap gap-1.5">
                  {catalog.categories.map((c) => (
                    <Chip
                      key={c.name}
                      selected={c.name === category?.name}
                      aria-pressed={c.name === category?.name}
                      onClick={() => setAisle(c.name)}
                    >
                      {c.name}
                    </Chip>
                  ))}
                </div>
              )}
              <div className="mt-3">
                {shown.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label={finding ? "Matching ingredients" : `${category?.name ?? ""} ingredients`}>
                    {shown.map((item) => {
                      const on = picked.includes(item.id);
                      return (
                        <li key={item.id}>
                          <Chip selected={on} aria-pressed={on} onClick={() => toggleIngredient(item)}>
                            {on && <Check aria-hidden className="size-3.5" />}
                            {item.name}
                          </Chip>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p role="status" className="text-sm text-ink-muted">
                    Nothing called “{query.trim()}” yet. Try a simpler word, or browse the aisles.
                  </p>
                )}
              </div>
            </fieldset>

            <fieldset className="mb-6 min-w-0">
              <legend className={legend}>Diet</legend>
              <div className="flex flex-wrap gap-1.5">
                {options.diets.map((d) => {
                  const on = !!draft.diet?.includes(d.slug);
                  return (
                    <Chip key={d.slug} selected={on} aria-pressed={on} onClick={() => toggleList("diet", d.slug)}>
                      {d.name}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mb-6 min-w-0">
              <legend className={legend}>Allergens to avoid</legend>
              <div className="flex flex-wrap gap-1.5">
                {options.allergens.map((a) => {
                  const on = !!draft.exclude?.includes(a.slug);
                  return (
                    <Chip key={a.slug} selected={on} aria-pressed={on} onClick={() => toggleList("exclude", a.slug)}>
                      {a.name.toLowerCase()}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mb-6 min-w-0">
              <legend className={legend}>Total time, minutes</legend>
              <div className="flex flex-wrap gap-1.5">
                {TIME.map((t) => {
                  const on = draft.minTime === t.min && draft.maxTime === t.max;
                  return (
                    <Chip
                      key={t.label}
                      tone="mono"
                      selected={on}
                      aria-pressed={on}
                      onClick={() =>
                        setDraft((d) => ({ ...d, minTime: on ? undefined : t.min, maxTime: on ? undefined : t.max }))
                      }
                    >
                      {t.label}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid gap-6 sm:grid-cols-2">
              <fieldset className="min-w-0">
                <legend className={legend}>Calories per serving</legend>
                <div className="flex flex-wrap gap-1.5">
                  {CALORIES.map((c) => {
                    const on = draft.calMax === c.max;
                    return (
                      <Chip
                        key={c.max}
                        tone="mono"
                        selected={on}
                        aria-pressed={on}
                        onClick={() => setDraft((d) => ({ ...d, calMax: on ? undefined : c.max }))}
                      >
                        {c.label}
                      </Chip>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="min-w-0">
                <legend className={legend}>Protein per serving</legend>
                <div className="flex flex-wrap gap-1.5">
                  {PROTEIN.map((g) => {
                    const on = draft.proteinMin === g;
                    return (
                      <Chip
                        key={g}
                        tone="mono"
                        selected={on}
                        aria-pressed={on}
                        onClick={() => setDraft((d) => ({ ...d, proteinMin: on ? undefined : g }))}
                      >
                        {g} g or more
                      </Chip>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-(--gutter) py-3">
            <button
              type="button"
              onClick={() => {
                setDraft({});
                setQuery("");
              }}
              disabled={count === 0}
              className="inline-flex min-h-11 items-center text-sm text-ink-muted underline-offset-4 hover:text-herb hover:underline disabled:opacity-50 disabled:hover:no-underline"
            >
              Clear all
            </button>
            <Button type="submit" size="lg" className="min-w-40">
              Show recipes{count > 0 ? ` (${count} chosen)` : ""}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
