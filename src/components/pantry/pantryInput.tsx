"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

/**
 * The pantry door. One component, two homes:
 *
 *  - "landing": local state; "Find recipes" is a plain GET form to /pantry
 *    (hidden inputs carry `pantry` and `use`), so it also works as a link target.
 *  - "results": the URL is the state. Every change pushes a new
 *    `/pantry?pantry=...` (back button steps through edits) and the server
 *    page re-ranks. Other filter params in the URL are preserved.
 *
 * In both, the pantry is mirrored to localStorage so a logged-out visitor's
 * pantry survives a refresh. URL wins when it has a pantry; storage only fills
 * an empty one. Autocomplete goes through /api/ingredients/suggest (which calls
 * suggest_ingredients in Postgres) -- the browser never talks to Supabase.
 */

export type PantryItem = { id: number; name: string };

type Suggestion = {
  ingredientId: number;
  canonicalName: string;
  matchedText: string;
  matchKind: "name" | "alias";
};

export type PantryInputProps = {
  variant: "landing" | "results";
  initialItems?: PantryItem[];
  /** Ingredient ids flagged "use up". Subset of the pantry. */
  initialUse?: number[];
  initialMaxMissing?: number;
  className?: string;
};

const STORAGE_KEY = "minced.pantry.v1";
const DEFAULT_MAX_MISSING = 3;
const MISSING_OPTIONS = [
  { value: 0, label: "Nothing" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 5, label: "5" },
] as const;

type Stored = { items: PantryItem[]; use: number[]; maxMissing: number };

function readStored(): Stored | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    const { items, use, maxMissing } = p as Partial<Stored>;
    if (!Array.isArray(items)) return null;
    const clean = items.filter(
      (i): i is PantryItem =>
        !!i && Number.isInteger(i.id) && i.id > 0 && typeof i.name === "string",
    );
    const ids = new Set(clean.map((i) => i.id));
    return {
      items: clean.slice(0, 50),
      use: Array.isArray(use) ? use.filter((n) => ids.has(n)) : [],
      maxMissing: Number.isInteger(maxMissing) ? (maxMissing as number) : DEFAULT_MAX_MISSING,
    };
  } catch {
    return null;
  }
}

function writeStored(value: Stored) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* private window / blocked storage: the URL still carries the pantry */
  }
}

export function PantryInput({
  variant,
  initialItems = [],
  initialUse = [],
  initialMaxMissing = DEFAULT_MAX_MISSING,
  className,
}: PantryInputProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const uid = useId();
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;

  const [items, setItems] = useState<PantryItem[]>(initialItems);
  const [use, setUse] = useState<number[]>(initialUse);
  const [maxMissing, setMaxMissing] = useState(initialMaxMissing);

  // Results mode: the URL is the truth. When it changes (back button, shared
  // link) re-seed local state during render -- the documented way to derive
  // state from props without an effect.
  const propsKey = JSON.stringify([initialItems, initialUse, initialMaxMissing]);
  const [seenKey, setSeenKey] = useState(propsKey);
  if (variant === "results" && seenKey !== propsKey) {
    setSeenKey(propsKey);
    setItems(initialItems);
    setUse(initialUse);
    setMaxMissing(initialMaxMissing);
  }

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [settledQuery, setSettledQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cache = useRef(new Map<string, Suggestion[]>());

  // Storage <-> URL, once on mount.
  useEffect(() => {
    if (initialItems.length > 0) {
      writeStored({ items: initialItems, use: initialUse, maxMissing: initialMaxMissing });
      return;
    }
    const stored = readStored();
    if (!stored || stored.items.length === 0) return;
    setItems(stored.items);
    setUse(stored.use);
    setMaxMissing(stored.maxMissing);
    if (variant === "results") {
      router.replace(buildUrl(stored.items, stored.use, stored.maxMissing));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  function buildUrl(nextItems: PantryItem[], nextUse: number[], nextMax: number) {
    // Read at click time (not useSearchParams) so static pages need no Suspense.
    const params = new URLSearchParams(window.location.search);
    params.delete("cursor");
    if (nextItems.length) params.set("pantry", nextItems.map((i) => i.id).join(","));
    else params.delete("pantry");
    if (nextUse.length) params.set("use", nextUse.join(","));
    else params.delete("use");
    if (nextMax !== DEFAULT_MAX_MISSING) params.set("maxMissing", String(nextMax));
    else params.delete("maxMissing");
    const qs = params.toString();
    return `/pantry${qs ? `?${qs}` : ""}`;
  }

  function commit(nextItems: PantryItem[], nextUse: number[], nextMax: number) {
    setItems(nextItems);
    setUse(nextUse);
    setMaxMissing(nextMax);
    writeStored({ items: nextItems, use: nextUse, maxMissing: nextMax });
    if (variant === "results") {
      startTransition(() => router.push(buildUrl(nextItems, nextUse, nextMax), { scroll: false }));
    }
  }

  function add(s: Suggestion) {
    if (!items.some((i) => i.id === s.ingredientId)) {
      commit([...items, { id: s.ingredientId, name: s.canonicalName }], use, maxMissing);
    }
    setQuery("");
    setSuggestions([]);
    setSettledQuery("");
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  }

  function remove(id: number) {
    commit(
      items.filter((i) => i.id !== id),
      use.filter((u) => u !== id),
      maxMissing,
    );
    inputRef.current?.focus();
  }

  function toggleUse(id: number) {
    commit(items, use.includes(id) ? use.filter((u) => u !== id) : [...use, id], maxMissing);
  }

  // Debounced fetch with abort; results cached per query for the session.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const hit = cache.current.get(q);
    if (hit) {
      setSuggestions(hit);
      setSettledQuery(q);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ingredients/suggest?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const body = (await res.json()) as { suggestions: Suggestion[] };
        cache.current.set(q, body.suggestions);
        setSuggestions(body.suggestions);
        setSettledQuery(q);
        setActive(0);
      } catch {
        /* aborted or offline: keep whatever is showing */
      }
    }, 60);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const chosen = new Set(items.map((i) => i.id));
  const visible = query.trim() ? suggestions.filter((s) => !chosen.has(s.ingredientId)) : [];
  const typed = query.trim().toLowerCase();
  const settled = settledQuery === typed && typed !== "";
  const showNone = open && settled && visible.length === 0;
  const showList = open && visible.length > 0;
  const activeIndex = Math.min(active, Math.max(visible.length - 1, 0));

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && visible.length) {
      e.preventDefault();
      setOpen(true);
      setActive((activeIndex + 1) % visible.length);
    } else if (e.key === "ArrowUp" && visible.length) {
      e.preventDefault();
      setActive((activeIndex - 1 + visible.length) % visible.length);
    } else if (e.key === "Enter" || e.key === ",") {
      if (typed) {
        e.preventDefault(); // never submit the landing form mid-typing
        const pick = visible[activeIndex];
        if (pick) add(pick);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && items.length) {
      remove(items[items.length - 1].id);
    }
  }

  const empty = items.length === 0;

  return (
    <div className={className}>
      <div className="relative">
        <label htmlFor={`${uid}-input`} className="sr-only">
          Add an ingredient you have
        </label>
        <div className="flex min-h-12 items-center gap-2 rounded-field border border-field bg-surface px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:border-herb focus-within:ring-[3px] focus-within:ring-herb/20">
          <Search aria-hidden className="size-4 shrink-0 text-stone" />
          <input
            ref={inputRef}
            id={`${uid}-input`}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-describedby={hintId}
            aria-activedescendant={showList ? `${uid}-opt-${activeIndex}` : undefined}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder={empty ? "Chicken, rice, onion…" : "Add another"}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setActive(0);
              if (!e.target.value.trim()) {
                setSuggestions([]);
                setSettledQuery("");
              }
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
            className="min-h-11 w-full min-w-0 bg-transparent py-2 text-base outline-none placeholder:text-ink-subtle"
          />
        </div>

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Matching ingredients"
            className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-field border border-line-strong bg-surface shadow-lift"
          >
            {visible.map((s, i) => (
              <li
                key={s.ingredientId}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                // mousedown, not click: the input's blur would close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2.5 text-[0.9375rem]",
                  i === activeIndex ? "bg-sunken text-ink" : "text-ink",
                )}
              >
                <span className="font-medium">{s.canonicalName}</span>
                {s.matchKind === "alias" && (
                  <span className="truncate font-mono text-[0.6875rem] text-ink-subtle">
                    {s.matchedText}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {showNone && (
          <p
            role="status"
            className="absolute inset-x-0 top-full z-30 mt-1.5 rounded-field border border-line-strong bg-surface px-3.5 py-3 text-sm text-ink-muted shadow-lift"
          >
            Minced doesn&apos;t know &ldquo;{query.trim()}&rdquo; yet. Try a simpler
            name.
          </p>
        )}
      </div>

      <p id={hintId} className="sr-only">
        Type an ingredient, then press Enter or tap a suggestion. Backspace removes the last
        one.
      </p>

      {!empty && (
        <>
          <ul aria-label="Your pantry" className="mt-3.5 flex flex-wrap gap-2">
            {items.map((item) => {
              const used = use.includes(item.id);
              return (
                <li
                  key={item.id}
                  className={cn(
                    "inline-flex items-stretch overflow-hidden rounded-sheet border text-[0.875rem]",
                    used ? "border-herb bg-herb text-on-herb" : "border-line-strong bg-surface text-ink",
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={used}
                    aria-label={`${item.name}, must use`}
                    onClick={() => toggleUse(item.id)}
                    className="flex min-h-10 items-center gap-1.5 py-1.5 pr-1 pl-3 font-medium pointer-coarse:min-h-11"
                  >
                    {used && <span aria-hidden className="size-1.5 rounded-full bg-saffron" />}
                    {item.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item.name}`}
                    onClick={() => remove(item.id)}
                    className={cn(
                      "flex min-h-10 min-w-10 items-center justify-center transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                      used ? "hover:text-saffron" : "text-ink-subtle hover:text-paprika",
                    )}
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-[0.8125rem] leading-snug text-ink-muted">
            {use.length > 0
              ? "Every recipe uses the ingredients marked with a dot."
              : "Tap an ingredient that has to be used up and every recipe will use it."}
          </p>
        </>
      )}

      {variant === "results" && (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span id={`${uid}-missing`} className="label-mono">
            I can be missing
          </span>
          <div role="group" aria-labelledby={`${uid}-missing`} className="flex flex-wrap gap-2">
            {MISSING_OPTIONS.map((o) => (
              <Chip
                key={o.value}
                tone="mono"
                selected={maxMissing === o.value}
                onClick={() => commit(items, use, o.value)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
          {!empty && (
            <button
              type="button"
              onClick={() => commit([], [], maxMissing)}
              className="ml-auto inline-flex min-h-11 items-center text-[0.8125rem] text-ink-muted underline-offset-4 hover:text-herb hover:underline"
            >
              Clear pantry
            </button>
          )}
          <span role="status" className="sr-only">
            {isPending ? "Updating recipes" : ""}
          </span>
        </div>
      )}

      {variant === "landing" && (
        <form action="/pantry" method="get" className="mt-4">
          {!empty && <input type="hidden" name="pantry" value={items.map((i) => i.id).join(",")} />}
          {use.length > 0 && <input type="hidden" name="use" value={use.join(",")} />}
          <Button type="submit" size="lg" className="w-full" disabled={empty}>
            {empty
              ? "Add an ingredient to start"
              : `Find recipes with ${items.length} ingredient${items.length === 1 ? "" : "s"}`}
          </Button>
        </form>
      )}
    </div>
  );
}
