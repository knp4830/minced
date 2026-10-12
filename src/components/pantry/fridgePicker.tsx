"use client";

import { Check, Refrigerator, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { readFridge, writeFridge, type FridgeItem } from "@/lib/fridgeStorage";
import type { CatalogItem, IngredientCatalog } from "@/lib/queries/ingredientCatalog";
import { cn } from "@/lib/utils";

/**
 * The pantry door: tap what is in the fridge, then see every recipe that uses
 * any of it. No typing is ever required; the find box inside the sheet exists
 * for the rare item that is not among a tab's most-used chips.
 *
 *  - "hero": the button on the landing page. Remembers the fridge in
 *    localStorage and shows how many things are in it.
 *  - "page": /pantry. The URL is the truth (`?pantry=12,40`): the committed
 *    items render as removable chips and every change pushes a new URL.
 *
 * Inside the sheet the choice is a draft. It becomes the fridge only on
 * "Show recipes", so dismissing the sheet throws the edits away.
 * A native <dialog> gives the focus trap, Escape and inert background; it is a
 * bottom sheet on phones and a centred panel from md up.
 */

const TOP_N = 20;
const FIND_LIMIT = 60;

export type FridgePickerProps = {
  catalog: IngredientCatalog;
  variant: "hero" | "page";
  /** Page variant: the fridge as the URL has it (names resolved server-side). */
  initial?: FridgeItem[];
  className?: string;
};

function pantryUrl(items: FridgeItem[], keepFilters: boolean): string {
  // Read at click time (not useSearchParams) so static pages need no Suspense.
  const params = new URLSearchParams(keepFilters ? window.location.search : "");
  params.delete("cursor");
  if (items.length) params.set("pantry", items.map((i) => i.id).join(","));
  else params.delete("pantry");
  const use = (params.get("use") ?? "")
    .split(",")
    .filter((u) => items.some((i) => String(i.id) === u));
  if (use.length) params.set("use", use.join(","));
  else params.delete("use");
  const qs = params.toString().replaceAll("%2C", ",");
  return `/pantry${qs ? `?${qs}` : ""}`;
}

export function FridgePicker({ catalog, variant, initial = [], className }: FridgePickerProps) {
  const router = useRouter();
  const uid = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [committed, setCommitted] = useState<FridgeItem[]>(initial);
  const [draft, setDraft] = useState<FridgeItem[]>(initial);
  const [tab, setTab] = useState(catalog.categories[0]?.name ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  // Page variant: the URL is the truth. When it changes (back button, a shared
  // link) re-seed during render -- the documented way to derive state from
  // props without an effect.
  const initialKey = JSON.stringify(initial);
  const [seenKey, setSeenKey] = useState(initialKey);
  if (variant === "page" && seenKey !== initialKey) {
    setSeenKey(initialKey);
    setCommitted(initial);
  }

  // Storage <-> URL, once on mount. URL wins; storage only fills an empty one.
  useEffect(() => {
    if (variant === "page") {
      if (initial.length > 0) {
        writeFridge(initial);
        return;
      }
      const stored = readFridge();
      if (stored.length > 0) {
        setCommitted(stored);
        router.replace(pantryUrl(stored, true));
      }
      return;
    }
    const stored = readFridge();
    if (stored.length > 0) setCommitted(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const catalogIds = useMemo(
    () => new Set(catalog.categories.flatMap((c) => c.items.map((i) => i.id))),
    [catalog],
  );
  const draftIds = useMemo(() => new Set(draft.map((i) => i.id)), [draft]);
  const offCatalog = draft.filter((i) => !catalogIds.has(i.id));

  const finding = query.trim().toLowerCase();
  const found = useMemo(() => {
    if (!finding) return [];
    // Rank: name starts with it, name contains it, then a synonym ("green
    // onion" finds scallion). Within a rank, most-used first.
    const rank = (i: CatalogItem): number => {
      const name = i.name.toLowerCase();
      if (name.startsWith(finding)) return 0;
      if (name.includes(finding)) return 1;
      return i.aka?.split("|").some((s) => s.includes(finding)) ? 2 : 3;
    };
    return catalog.categories
      .flatMap((c) => c.items)
      .map((i) => ({ i, r: rank(i) }))
      .filter((x) => x.r < 3)
      .sort((a, b) => a.r - b.r || b.i.uses - a.i.uses)
      .map((x) => x.i);
  }, [catalog, finding]);

  const activeCategory = catalog.categories.find((c) => c.name === tab) ?? catalog.categories[0];
  const showAll = expanded.has(activeCategory?.name ?? "");
  const tabItems = activeCategory?.items ?? [];
  const shownItems = finding
    ? found.slice(0, FIND_LIMIT)
    : showAll
      ? tabItems
      : tabItems.slice(0, TOP_N);

  function openSheet() {
    setDraft(committed);
    setQuery("");
    dialogRef.current?.showModal();
  }

  function closeSheet() {
    dialogRef.current?.close();
  }

  function toggle(item: FridgeItem) {
    setDraft((cur) =>
      cur.some((i) => i.id === item.id) ? cur.filter((i) => i.id !== item.id) : [...cur, item],
    );
  }

  function commit(items: FridgeItem[]) {
    setCommitted(items);
    writeFridge(items);
    router.push(pantryUrl(items, variant === "page"), { scroll: variant !== "page" });
  }

  function showRecipes() {
    if (draft.length === 0) return;
    closeSheet();
    commit(draft);
  }

  function onTabKey(e: React.KeyboardEvent, index: number) {
    const last = catalog.categories.length - 1;
    let next = index;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else return;
    e.preventDefault();
    setTab(catalog.categories[next].name);
    tabRefs.current[next]?.focus();
  }

  const count = committed.length;
  const panelId = `${uid}-panel`;

  return (
    <div className={className}>
      {variant === "hero" ? (
        <Button
          variant="secondary"
          size="lg"
          aria-haspopup="dialog"
          onClick={openSheet}
          className="w-full sm:w-auto"
        >
          <Refrigerator aria-hidden className="size-[18px]" />
          What&apos;s in my fridge?
          {count > 0 && (
            <span className="rounded-full bg-herb px-2 py-0.5 font-mono text-[0.6875rem] text-on-herb">
              {count}
            </span>
          )}
        </Button>
      ) : (
        <div>
          {count > 0 && (
            <ul aria-label="In your fridge" className="mb-3.5 flex flex-wrap gap-2">
              {committed.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => commit(committed.filter((i) => i.id !== item.id))}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-sheet border border-herb bg-herb py-1.5 pr-2.5 pl-3.5 text-[0.875rem] font-medium text-on-herb transition-colors hover:bg-herb-deep pointer-coarse:min-h-11"
                  >
                    {item.name}
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button
              variant={count > 0 ? "secondary" : "primary"}
              size="md"
              aria-haspopup="dialog"
              onClick={openSheet}
            >
              <Refrigerator aria-hidden className="size-4" />
              {count > 0 ? "Add or change" : "Pick what’s in my fridge"}
            </Button>
            {count > 0 && (
              <button
                type="button"
                onClick={() => commit([])}
                className="inline-flex min-h-11 items-center text-[0.8125rem] text-ink-muted underline-offset-4 hover:text-herb hover:underline"
              >
                Empty the fridge
              </button>
            )}
          </div>
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-title`}
        onClick={(e) => {
          if (e.target === dialogRef.current) closeSheet();
        }}
        className={cn(
          "fixed inset-x-0 top-auto bottom-0 m-0 h-[88dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[16px] bg-surface p-0 text-ink shadow-sheet backdrop:bg-scrim open:flex",
          "md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:h-[36rem] md:max-h-[85dvh] md:w-[42rem] md:max-w-[calc(100vw-3rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:shadow-frame",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-(--gutter) py-3">
          <h2 id={`${uid}-title`} className="text-[1.0625rem] md:text-[1.25rem]">
            What&apos;s in my fridge?
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={closeSheet}
            className="-mr-2 flex size-11 items-center justify-center rounded-md text-ink-muted hover:text-herb"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-(--gutter) pt-3.5 pb-2">
          <p className="mb-3 text-[0.8125rem] leading-snug text-ink-muted">
            Tap everything you have. One is enough: you&apos;ll see every recipe that uses any of
            it. Salt, pepper, oil, butter, sugar, flour and water are assumed.
          </p>

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
              placeholder="Find an ingredient"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
              className="w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle sm:text-sm"
            />
          </div>

          {!finding && (
            <div
              role="tablist"
              aria-label="Aisles"
              className="-mx-(--gutter) mt-3 flex gap-1.5 overflow-x-auto px-(--gutter) pb-1"
            >
              {catalog.categories.map((c, i) => {
                const picked = draft.filter((d) => c.items.some((it) => it.id === d.id)).length;
                const selected = c.name === activeCategory?.name;
                return (
                  <button
                    key={c.name}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`${uid}-tab-${i}`}
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setTab(c.name)}
                    onKeyDown={(e) => onTabKey(e, i)}
                    className={cn(
                      "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border px-3.5 text-[0.875rem] font-medium transition-colors pointer-coarse:min-h-11",
                      selected
                        ? "border-ink bg-ink text-canvas"
                        : "border-line-strong text-ink hover:border-herb hover:text-herb",
                    )}
                  >
                    {c.name}
                    {picked > 0 && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 font-mono text-[0.6875rem]",
                          selected ? "bg-canvas text-ink" : "bg-herb text-on-herb",
                        )}
                      >
                        <span className="sr-only">{picked} picked, </span>
                        <span aria-hidden>{picked}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div
            id={panelId}
            role={finding ? "group" : "tabpanel"}
            aria-label={finding ? "Matching ingredients" : undefined}
            aria-labelledby={
              finding
                ? undefined
                : `${uid}-tab-${Math.max(
                    catalog.categories.findIndex((c) => c.name === activeCategory?.name),
                    0,
                  )}`
            }
            className="mt-3.5"
          >
            {shownItems.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {shownItems.map((item) => {
                  const on = draftIds.has(item.id);
                  return (
                    <li key={item.id}>
                      <Chip
                        selected={on}
                        onClick={() => toggle({ id: item.id, name: item.name })}
                        className="min-h-10 px-3.5 text-[0.875rem] pointer-coarse:min-h-11"
                      >
                        {on && <Check aria-hidden className="size-3.5" />}
                        {item.name}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p role="status" className="text-sm text-ink-muted">
                Nothing called &ldquo;{query.trim()}&rdquo; yet. Try a simpler word, or look
                through the aisles.
              </p>
            )}

            {!finding && tabItems.length > TOP_N && (
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() =>
                  setExpanded((cur) => {
                    const next = new Set(cur);
                    if (next.has(activeCategory.name)) next.delete(activeCategory.name);
                    else next.add(activeCategory.name);
                    return next;
                  })
                }
                className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-ink underline underline-offset-4 hover:text-herb"
              >
                {showAll ? `Show fewer ${activeCategory.name.toLowerCase()}` : `Show all ${tabItems.length}`}
              </button>
            )}
            {finding && found.length > FIND_LIMIT && (
              <p className="mt-3 text-[0.8125rem] text-ink-muted">
                Showing {FIND_LIMIT} of {found.length}. Type a little more to narrow it.
              </p>
            )}
          </div>

          {offCatalog.length > 0 && (
            <div className="mt-4">
              <p className="label-mono mb-2">Also in your fridge</p>
              <ul className="flex flex-wrap gap-2">
                {offCatalog.map((item) => (
                  <li key={item.id}>
                    <Chip selected onClick={() => toggle(item)} className="min-h-10 pointer-coarse:min-h-11">
                      <Check aria-hidden className="size-3.5" />
                      {item.name}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line bg-surface px-(--gutter) py-3">
          <p role="status" aria-live="polite" className="min-w-0 flex-1 text-[0.8125rem] text-ink-muted">
            <span className="font-mono font-semibold text-ink">{draft.length}</span> picked
            {draft.length > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setDraft([])}
                  className="ml-1 inline-flex min-h-11 items-center underline underline-offset-4 hover:text-herb"
                >
                  Clear
                </button>
              </>
            )}
          </p>
          <Button size="lg" onClick={showRecipes} disabled={draft.length === 0}>
            {draft.length === 0 ? "Pick something" : "Show recipes"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
