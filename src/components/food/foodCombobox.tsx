"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { suggestFoods } from "@/lib/actions/foods";
import type { FoodHit } from "@/lib/foodHit";
import { cn } from "@/lib/utils";

/*
 * Type-ahead for foods: canonical ingredients first, then foods and brands (WAI-ARIA combobox pattern with
 * a listbox popup, list autocomplete). Used by the user-recipe ingredient line and the Me "Add food"
 * dialog, so both doors pick from the same list.
 *
 * Behaviour:
 *   - Suggestions after two characters, 200 ms after the last keystroke; a slow answer to an old query is
 *     ignored (sequence guard).
 *   - Down/Up move through the list, Enter picks the highlighted one, Escape closes the list (and only
 *     the list: the dialog around it stays open), Tab leaves without picking.
 *   - Typing is free text. Only picking sets an ingredient; the caller decides what unpicked text means.
 *   - A hit that cannot be calculated says "no nutrition data" in words, never colour alone.
 */

type Status = "idle" | "loading" | "ready" | "error";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 200;

export function FoodCombobox({
  value,
  onValueChange,
  onPick,
  onBlurText,
  inputId,
  ariaLabel,
  placeholder,
  maxLength = 80,
  invalid,
  describedBy,
  autoFocus,
  className,
  inline = false,
}: {
  value: string;
  onValueChange: (text: string) => void;
  onPick: (hit: FoodHit) => void;
  /** Fires when focus leaves the box (the form uses it to check an unpicked, typed name). */
  onBlurText?: (text: string) => void;
  inputId?: string;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
  className?: string;
  /**
   * Show the list in the page flow (pushing what is below down) instead of floating over it. Use inside a
   * dialog, where a floating list would be clipped by the dialog's own scroll area.
   */
  inline?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function search(text: string) {
    if (timer.current) clearTimeout(timer.current);
    const mine = ++seq.current;
    if (text.trim().length < MIN_CHARS) {
      setHits([]);
      setStatus("idle");
      setOpen(false);
      setActive(-1);
      return;
    }
    setStatus("loading");
    timer.current = setTimeout(async () => {
      const r = await suggestFoods(text);
      if (mine !== seq.current) return; // a newer keystroke is in flight
      if (!r.ok) {
        setStatus("error");
        setHits([]);
        setOpen(true);
        return;
      }
      setHits(r.hits);
      setStatus("ready");
      setOpen(true);
      setActive(r.hits.length > 0 ? 0 : -1);
    }, DEBOUNCE_MS);
  }

  function pick(hit: FoodHit) {
    seq.current++; // drop any answer still on its way
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
    setActive(-1);
    setStatus("idle");
    onPick(hit);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      if (hits.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      if (hits.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a <= 0 ? hits.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && hits[active]) {
        e.preventDefault(); // do not submit the surrounding form
        pick(hits[active]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault(); // keep a surrounding <dialog> open
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === "Home" && open && hits.length > 0 && e.ctrlKey) {
      e.preventDefault();
      setActive(0);
    }
  }

  // Keep the highlighted option in view when arrowing through a long list.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${uid}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, uid]);

  const ingredients = hits.map((h, i) => ({ h, i })).filter((x) => x.h.kind === "ingredient");
  const foods = hits.map((h, i) => ({ h, i })).filter((x) => x.h.kind === "food");
  const showPopup = open && (hits.length > 0 || status === "error" || (status === "ready" && value.trim().length >= MIN_CHARS));
  const showList = showPopup && hits.length > 0;

  const announce =
    status === "loading"
      ? "Searching"
      : status === "error"
        ? "Search did not work. Keep typing, or try again."
        : status === "ready"
          ? hits.length === 0
            ? "No matches"
            : `${hits.length} ${hits.length === 1 ? "suggestion" : "suggestions"}. Use the up and down arrows, then Enter.`
          : "";

  return (
    <div
      ref={wrap}
      className={cn("relative", className)}
      onBlur={(e) => {
        // Focus left the whole widget (the list is not focusable, so this means the input).
        if (!wrap.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          onBlurText?.(value);
        }
      }}
    >
      <Input
        id={inputId}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${uid}-opt-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        maxLength={maxLength}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          search(e.target.value);
        }}
        onFocus={() => {
          if (hits.length > 0 && status === "ready") setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>

      <div
        hidden={!showPopup}
        className={cn(
          "mt-1 overflow-y-auto overscroll-contain rounded-lg border border-line-strong bg-surface",
          inline ? "max-h-60" : "absolute inset-x-0 top-full z-40 max-h-72 shadow-lg",
        )}
      >
        {status === "error" && <p className="px-3.5 py-3 text-[0.8125rem] text-paprika-deep">Search did not work. Keep typing, or try again.</p>}
        {status === "ready" && hits.length === 0 && (
          <p className="px-3.5 py-3 text-[0.8125rem] text-ink-muted">
            Nothing matches &ldquo;{value.trim()}&rdquo;. Try a simpler name, like the plain ingredient.
          </p>
        )}
        {hits.length > 0 && (
          <div id={listId} role="listbox" aria-label="Food suggestions">
            {ingredients.length > 0 && (
              <Group id={`${uid}-g-ing`} title="Ingredients">
                {ingredients.map(({ h, i }) => (
                  <Option key={`i${h.ingredientId}`} id={`${uid}-opt-${i}`} hit={h} active={i === active} onPick={() => pick(h)} onHover={() => setActive(i)} />
                ))}
              </Group>
            )}
            {foods.length > 0 && (
              <Group id={`${uid}-g-food`} title="Foods and brands">
                {foods.map(({ h, i }) => (
                  <Option key={`f${h.fdcId}`} id={`${uid}-opt-${i}`} hit={h} active={i === active} onPick={() => pick(h)} onHover={() => setActive(i)} />
                ))}
              </Group>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="label-mono sticky top-0 border-b border-line bg-band px-3.5 py-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function Option({ id, hit, active, onPick, onHover }: { id: string; hit: FoodHit; active: boolean; onPick: () => void; onHover: () => void }) {
  const detail = [hit.brand, hit.serving, hit.kcalPer100g !== null ? `${Math.round(hit.kcalPer100g)} kcal per 100 g` : null].filter(Boolean).join(" · ");
  return (
    // The option is not focusable (focus stays in the input); the mouse path uses mousedown so the input keeps focus.
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      onMouseMove={onHover}
      className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5 py-2", active ? "bg-band shadow-[inset_3px_0_0_0_var(--color-herb)]" : "")}
    >
      <span className="min-w-0">
        <span className="block truncate text-[0.9375rem]">{hit.label}</span>
        {detail && <span className="block truncate font-mono text-[0.6875rem] text-ink-muted">{detail}</span>}
      </span>
      {hit.hasNutrition === false && (
        <span className="shrink-0 rounded-sm border border-line-strong px-1.5 py-0.5 font-mono text-[0.6875rem] text-ink-muted">no nutrition data</span>
      )}
    </div>
  );
}
