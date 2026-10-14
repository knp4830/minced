"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { checkIngredientName, deleteRecipe, saveRecipe, withdrawRecipe } from "@/lib/actions/myRecipes";
import {
  EMPTY_INGREDIENT,
  LIMITS,
  SPICE_LABELS,
  type FormOptions,
  type IngredientRow,
  type RecipeFormValues,
  type RecipeStatus,
} from "@/lib/recipeForm";
import { cn } from "@/lib/utils";

/*
 * Create / edit a recipe (M5.1-M5.3).
 *
 * A client component because it holds row state (add, remove, reorder), but it
 * owns no authority: every save goes to a Server Action that re-shapes the input,
 * and the database function save_my_recipe() is what actually validates it. The
 * form only helps people get it right the first time.
 *
 * Errors from the database carry a field hint ("ingredient:3", "title", "step:2");
 * fieldId() turns it into the element to focus.
 */

type Row = IngredientRow & { key: number };
type StepRow = { key: number; text: string };
type Err = { message: string; field?: string } | null;

type RecipeMeta = {
  id: string;
  slug: string;
  status: RecipeStatus;
  allergens: string[];
  returned: boolean;
  reviewNote: string | null;
};

function fieldId(field: string | undefined): string | null {
  if (!field) return null;
  const ing = /^ingredient:(\d+)$/.exec(field);
  if (ing) return `ing-${ing[1]}-name`;
  const step = /^step:(\d+)$/.exec(field);
  if (step) return `step-${step[1]}`;
  const map: Record<string, string> = {
    title: "f-title",
    description: "f-description",
    cuisine: "f-cuisine",
    prep_time: "f-prep",
    cook_time: "f-cook",
    servings: "f-servings",
    cost: "f-cost",
    spice: "f-spice-group",
    ingredients: "add-ingredient",
    steps: "add-step",
    rights: "f-rights",
  };
  return map[field] ?? null;
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  const id = `sec-${n}`;
  return (
    <section aria-labelledby={id} className="border-t border-line pt-6">
      <h2 id={id} className="mb-4 flex items-baseline gap-3 text-xl">
        <span className="font-mono text-[0.8125rem] font-medium text-herb">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && (
        <FieldHint id={`${id}-hint`} error={error}>
          {hint}
        </FieldHint>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border border-line-strong text-ink-muted transition-colors",
        "hover:border-herb hover:text-herb disabled:pointer-events-none disabled:opacity-35 pointer-coarse:size-11",
      )}
    >
      {children}
    </button>
  );
}

export function RecipeForm({
  options,
  initial,
  recipe,
  justSaved = false,
}: {
  options: FormOptions;
  initial: RecipeFormValues;
  recipe: RecipeMeta | null;
  /** Arrived straight from the first save (the URL says ?saved=1). */
  justSaved?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const keyRef = useRef(1);
  const nextKey = () => keyRef.current++;

  const [v, setV] = useState(() => ({ ...initial }));
  const [ings, setIngs] = useState<Row[]>(() => initial.ingredients.map((i) => ({ ...i, key: nextKey() })));
  const [steps, setSteps] = useState<StepRow[]>(() => initial.steps.map((text) => ({ text, key: nextKey() })));
  const [err, setErr] = useState<Err>(null);
  const [notice, setNotice] = useState<string | null>(justSaved ? "Draft saved." : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [known, setKnown] = useState<Record<string, string | null | "pending">>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement>(null);

  const localNames = useMemo(() => new Set(options.ingredientNames), [options.ingredientNames]);

  const current = (): RecipeFormValues => ({
    ...v,
    ingredients: ings.map((r) => ({ quantity: r.quantity, unit: r.unit, name: r.name, note: r.note, optional: r.optional })),
    steps: steps.map((s) => s.text),
  });
  const snapshot = JSON.stringify(current());
  const savedRef = useRef(JSON.stringify({ ...initial }));
  const dirty = snapshot !== savedRef.current;

  // Warn before closing a tab with unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Focus management: after adding a row, and when an error names a field.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  useEffect(() => {
    if (!err) return;
    const target = fieldId(err.field);
    const el = target ? document.getElementById(target) : null;
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus({ preventScroll: true });
    } else {
      errRef.current?.focus();
    }
  }, [err]);

  const set = <K extends keyof RecipeFormValues>(k: K, val: RecipeFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  const invalid = (field: string) => err?.field === field || undefined;

  function toggle(list: "diets" | "cookware", id: number) {
    setV((p) => ({ ...p, [list]: p[list].includes(id) ? p[list].filter((x) => x !== id) : [...p[list], id] }));
  }

  // Ingredient rows -------------------------------------------------------
  const updateIng = (key: number, patch: Partial<IngredientRow>) =>
    setIngs((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  function addIng() {
    if (ings.length >= LIMITS.ingredients) return;
    const key = nextKey();
    setIngs((rows) => [...rows, { ...EMPTY_INGREDIENT, key }]);
    setFocusId(`ing-${ings.length + 1}-qty`);
  }
  const removeIng = (key: number) => {
    setIngs((rows) => rows.filter((r) => r.key !== key));
    setFocusId("add-ingredient");
  };
  const moveIng = (index: number, dir: -1 | 1) =>
    setIngs((rows) => {
      const j = index + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  async function checkName(name: string) {
    const clean = name.replace(/\s+/g, " ").trim();
    const lower = clean.toLowerCase();
    if (!clean || known[lower] !== undefined) return;
    if (localNames.has(lower)) {
      setKnown((k) => ({ ...k, [lower]: lower }));
      return;
    }
    setKnown((k) => ({ ...k, [lower]: "pending" }));
    const res = await checkIngredientName(clean);
    setKnown((k) => {
      const next = { ...k };
      if (res === null) delete next[lower];
      else next[lower] = res.canonical;
      return next;
    });
  }

  // Step rows -----------------------------------------------------------------
  function addStep() {
    if (steps.length >= LIMITS.steps) return;
    const key = nextKey();
    setSteps((rows) => [...rows, { key, text: "" }]);
    setFocusId(`step-${steps.length + 1}`);
  }
  const removeStep = (key: number) => {
    setSteps((rows) => rows.filter((r) => r.key !== key));
    setFocusId("add-step");
  };
  const moveStep = (index: number, dir: -1 | 1) =>
    setSteps((rows) => {
      const j = index + dir;
      if (j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });

  // Save / submit / withdraw / delete -------------------------------------------
  const status: RecipeStatus | "new" = recipe?.status ?? "new";

  function save(toReview: boolean) {
    setErr(null);
    setNotice(null);
    startTransition(async () => {
      const values = current();
      const res = await saveRecipe(recipe?.id ?? null, values, toReview);
      if (!res.ok) {
        setErr({ message: res.message, field: res.field });
        return;
      }
      savedRef.current = JSON.stringify({ ...values, rights: v.rights });
      if (res.status === "in_review" && status !== "in_review" && status !== "published") {
        router.push("/account?tab=book&notice=submitted");
      } else if (status === "new") {
        router.replace(`/recipes/${res.slug}/edit?saved=1`);
      } else {
        setNotice(res.status === "in_review" ? "Saved. Your recipe is waiting for review." : "Draft saved.");
        router.refresh();
      }
    });
  }

  function withdraw() {
    if (!recipe) return;
    setErr(null);
    startTransition(async () => {
      const res = await withdrawRecipe(recipe.id);
      if (!res.ok) return setErr({ message: res.message });
      router.push("/account?tab=book&notice=withdrawn");
    });
  }

  function remove() {
    if (!recipe) return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteRecipe(recipe.id);
      if (!res.ok) {
        setConfirmDelete(false);
        return setErr({ message: res.message });
      }
      savedRef.current = snapshot; // nothing left to lose
      router.push("/account?tab=book&notice=deleted");
    });
  }

  const spiceLabel = v.spice === null ? "Not set" : `${v.spice} / 4 — ${SPICE_LABELS[v.spice].toLowerCase()}`;
  const total = (Number(v.prep) || 0) + (Number(v.cook) || 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(status === "draft" || status === "new" ? false : true);
      }}
      noValidate
      data-recipe-form
      className="mx-auto max-w-[820px] px-(--gutter) pt-6 pb-0 md:pt-10"
    >
      <Link
        href="/account?tab=book"
        className="inline-flex min-h-11 items-center text-[0.875rem] font-medium text-ink-muted underline-offset-4 hover:text-herb hover:underline"
      >
        &larr; Recipe book
      </Link>
      <h1 className="mt-2 text-[1.75rem] leading-tight md:text-[2rem]">
        {recipe ? "Edit recipe" : "Create a recipe"}
      </h1>
      <p className="mt-1.5 max-w-xl text-[0.9375rem] leading-relaxed text-ink-muted">
        Ingredients, amounts and numbered steps. No backstory needed. Only you can see it until we have reviewed it.
      </p>

      {recipe?.returned && (
        <div role="note" className="mt-5 rounded-lg border border-saffron bg-saffron-tint px-4 py-3 text-[0.9375rem] text-saffron-ink">
          <p className="font-semibold">We sent this back with a note.</p>
          {recipe.reviewNote && <p className="mt-1">{recipe.reviewNote}</p>}
          <p className="mt-1">Fix it up and submit again whenever you are ready.</p>
        </div>
      )}
      {status === "published" && (
        <div role="note" className="mt-5 rounded-lg border border-line-strong bg-surface px-4 py-3 text-[0.9375rem]">
          This recipe is live on Minced. <strong>If you save changes it goes back to review</strong> and is hidden from
          the site until we approve it again.
        </div>
      )}
      {status === "in_review" && (
        <div role="note" className="mt-5 rounded-lg border border-line-strong bg-surface px-4 py-3 text-[0.9375rem]">
          Waiting for review. You can keep editing; saving keeps it in the queue.
        </div>
      )}

      <datalist id="ingredient-names">
        {options.ingredientNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className="mt-8 space-y-8">
        <Section n="01" title="Basics">
          <div className="space-y-4">
            <Field id="f-title" label="Title" hint={`${v.title.length}/${LIMITS.titleMax}`} error={err?.field === "title"}>
              <Input
                id="f-title"
                value={v.title}
                maxLength={LIMITS.titleMax}
                autoComplete="off"
                aria-invalid={invalid("title")}
                aria-describedby="f-title-hint"
                onChange={(e) => set("title", e.target.value)}
              />
            </Field>
            <Field id="f-cuisine" label="Cuisine or region (optional)">
              <Select
                id="f-cuisine"
                value={v.cuisineId}
                aria-invalid={invalid("cuisine")}
                onChange={(e) => set("cuisineId", e.target.value)}
              >
                <option value="">Not set</option>
                {options.cuisines.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="f-description"
              label="Short description (optional)"
              hint={`One or two sentences. ${v.description.length}/${LIMITS.descriptionMax}`}
              error={err?.field === "description"}
            >
              <Textarea
                id="f-description"
                rows={3}
                value={v.description}
                maxLength={LIMITS.descriptionMax}
                aria-invalid={invalid("description")}
                aria-describedby="f-description-hint"
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
        </Section>

        <Section n="02" title="Time & yield">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field id="f-prep" label="Prep (min)">
              <Input
                id="f-prep"
                mono
                inputMode="numeric"
                value={v.prep}
                maxLength={4}
                aria-invalid={invalid("prep_time")}
                onChange={(e) => set("prep", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field id="f-cook" label="Cook (min)" hint={total > 0 ? `Total ${total} min` : undefined}>
              <Input
                id="f-cook"
                mono
                inputMode="numeric"
                value={v.cook}
                maxLength={4}
                aria-invalid={invalid("cook_time")}
                aria-describedby={total > 0 ? "f-cook-hint" : undefined}
                onChange={(e) => set("cook", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field id="f-servings" label="Servings">
              <Input
                id="f-servings"
                mono
                inputMode="numeric"
                value={v.servings}
                maxLength={3}
                aria-invalid={invalid("servings")}
                onChange={(e) => set("servings", e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Field id="f-cost" label="Cost / serving ($, optional)">
              <Input
                id="f-cost"
                mono
                inputMode="decimal"
                value={v.cost}
                maxLength={6}
                aria-invalid={invalid("cost")}
                onChange={(e) => set("cost", e.target.value.replace(/[^\d.]/g, ""))}
              />
            </Field>
          </div>
        </Section>

        <Section n="03" title="Ingredients">
          <p id="ing-help" className="mb-3 max-w-xl text-[0.875rem] leading-relaxed text-ink-muted">
            Type the plain name, like <em>onion</em> or <em>green onion</em>, and pick from the suggestions. Amounts can be
            written as 2, 1/2 or 1 1/2; leave the amount empty for &ldquo;to taste&rdquo;. Salt, oil and the like count as
            pantry staples automatically.
          </p>
          <div
            aria-hidden
            className="label-mono mb-1.5 hidden gap-2 sm:grid sm:grid-cols-[4.5rem_6.5rem_minmax(0,1fr)_9rem_6.75rem]"
          >
            <span>Amount</span>
            <span>Unit</span>
            <span>Ingredient</span>
            <span>Prep note</span>
            <span />
          </div>
          <ol className="space-y-3 sm:space-y-2" aria-describedby="ing-help">
            {ings.map((row, i) => {
              const n = i + 1;
              const lower = row.name.replace(/\s+/g, " ").trim().toLowerCase();
              const res = lower ? known[lower] : undefined;
              const unresolved = res === null;
              const hintId = `ing-${n}-hint`;
              return (
                <li
                  key={row.key}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[4.5rem_6.5rem_minmax(0,1fr)_9rem_6.75rem] sm:items-start sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <Input
                    id={`ing-${n}-qty`}
                    mono
                    aria-label={`Ingredient ${n} amount`}
                    placeholder="Qty"
                    inputMode="decimal"
                    value={row.quantity}
                    maxLength={12}
                    onChange={(e) => updateIng(row.key, { quantity: e.target.value })}
                  />
                  <Select
                    id={`ing-${n}-unit`}
                    aria-label={`Ingredient ${n} unit`}
                    value={row.unit}
                    onChange={(e) => updateIng(row.key, { unit: e.target.value })}
                  >
                    <option value="">No unit</option>
                    {options.units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </Select>
                  <div className="col-span-2 sm:col-span-1">
                    <Input
                      id={`ing-${n}-name`}
                      list="ingredient-names"
                      aria-label={`Ingredient ${n} name`}
                      placeholder="Ingredient, e.g. onion"
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={row.name}
                      maxLength={LIMITS.nameMax}
                      aria-invalid={unresolved || invalid(`ingredient:${n}`)}
                      aria-describedby={res !== undefined && res !== "pending" ? hintId : undefined}
                      onChange={(e) => updateIng(row.key, { name: e.target.value })}
                      onBlur={(e) => void checkName(e.target.value)}
                    />
                    {unresolved && (
                      <FieldHint id={hintId} error>
                        &ldquo;{row.name.trim()}&rdquo; is not in our ingredient list. Pick a suggestion or try a simpler
                        name.
                      </FieldHint>
                    )}
                    {typeof res === "string" && res !== "pending" && res !== lower && (
                      <FieldHint id={hintId}>Counted as {res}</FieldHint>
                    )}
                  </div>
                  <Input
                    id={`ing-${n}-note`}
                    aria-label={`Ingredient ${n} prep note`}
                    placeholder="e.g. chopped"
                    autoComplete="off"
                    value={row.note}
                    maxLength={LIMITS.noteMax}
                    className="col-span-2 sm:col-span-1"
                    onChange={(e) => updateIng(row.key, { note: e.target.value })}
                  />
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                    <label className="mr-auto flex min-h-11 items-center gap-2 text-[0.875rem] text-ink-muted sm:hidden">
                      <input
                        type="checkbox"
                        checked={row.optional}
                        onChange={(e) => updateIng(row.key, { optional: e.target.checked })}
                        className="size-4 accent-[var(--color-herb)]"
                      />
                      Optional
                    </label>
                    <span className="flex gap-1">
                      <IconButton label={`Move ingredient ${n} up`} onClick={() => moveIng(i, -1)} disabled={i === 0}>
                        <ArrowUp aria-hidden className="size-4" />
                      </IconButton>
                      <IconButton
                        label={`Move ingredient ${n} down`}
                        onClick={() => moveIng(i, 1)}
                        disabled={i === ings.length - 1}
                      >
                        <ArrowDown aria-hidden className="size-4" />
                      </IconButton>
                      <IconButton label={`Remove ingredient ${n}`} onClick={() => removeIng(row.key)}>
                        <X aria-hidden className="size-4" />
                      </IconButton>
                    </span>
                  </div>
                  <label className="col-span-2 hidden items-center gap-1.5 text-[0.8125rem] text-ink-muted sm:col-start-3 sm:-mt-1 sm:flex">
                    <input
                      type="checkbox"
                      checked={row.optional}
                      onChange={(e) => updateIng(row.key, { optional: e.target.checked })}
                      className="size-4 accent-[var(--color-herb)]"
                    />
                    Optional
                  </label>
                </li>
              );
            })}
          </ol>
          <button
            id="add-ingredient"
            type="button"
            onClick={addIng}
            disabled={ings.length >= LIMITS.ingredients}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-outline text-[0.9375rem] font-medium text-ink-muted transition-colors hover:border-herb hover:text-herb disabled:opacity-45"
          >
            <Plus aria-hidden className="size-4" /> Add ingredient
          </button>
          <p className="mt-1.5 font-mono text-xs text-ink-subtle">
            {ings.length} of {LIMITS.ingredients}
          </p>
        </Section>

        <Section n="04" title="Cookware">
          <div role="group" aria-label="Cookware you need" className="flex flex-wrap gap-2">
            {options.cookware.map((c) => (
              <Chip key={c.id} selected={v.cookware.includes(c.id)} onClick={() => toggle("cookware", c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        </Section>

        <Section n="05" title="Method">
          <ol className="space-y-3">
            {steps.map((s, i) => {
              const n = i + 1;
              return (
                <li key={s.key} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 gap-y-2">
                  <span aria-hidden className="pt-3 font-mono text-[0.8125rem] text-ink-subtle">
                    {String(n).padStart(2, "0")}
                  </span>
                  <div>
                    <Textarea
                      id={`step-${n}`}
                      aria-label={`Step ${n}`}
                      rows={3}
                      value={s.text}
                      maxLength={LIMITS.stepMax}
                      aria-invalid={invalid(`step:${n}`)}
                      onChange={(e) => setSteps((rows) => rows.map((r) => (r.key === s.key ? { ...r, text: e.target.value } : r)))}
                    />
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-ink-subtle">
                        {s.text.length}/{LIMITS.stepMax}
                      </span>
                      <span className="flex gap-1">
                        <IconButton label={`Move step ${n} up`} onClick={() => moveStep(i, -1)} disabled={i === 0}>
                          <ArrowUp aria-hidden className="size-4" />
                        </IconButton>
                        <IconButton
                          label={`Move step ${n} down`}
                          onClick={() => moveStep(i, 1)}
                          disabled={i === steps.length - 1}
                        >
                          <ArrowDown aria-hidden className="size-4" />
                        </IconButton>
                        <IconButton label={`Remove step ${n}`} onClick={() => removeStep(s.key)}>
                          <X aria-hidden className="size-4" />
                        </IconButton>
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <button
            id="add-step"
            type="button"
            onClick={addStep}
            disabled={steps.length >= LIMITS.steps}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-outline text-[0.9375rem] font-medium text-ink-muted transition-colors hover:border-herb hover:text-herb disabled:opacity-45"
          >
            <Plus aria-hidden className="size-4" /> Add step
          </button>
        </Section>

        <Section n="06" title="Dietary & spice">
          <div className="space-y-5">
            <div>
              <p id="diet-label" className="mb-2 text-[0.8125rem] font-semibold">
                Diet
              </p>
              <div role="group" aria-labelledby="diet-label" className="flex flex-wrap gap-2">
                {options.diets.map((d) => (
                  <Chip key={d.id} selected={v.diets.includes(d.id)} onClick={() => toggle("diets", d.id)}>
                    {d.name}
                  </Chip>
                ))}
              </div>
              <FieldHint>Only tick what is true for the ingredients you listed. We check this in review.</FieldHint>
            </div>

            <div>
              <p id="spice-label" className="mb-2 text-[0.8125rem] font-semibold">
                Spice
              </p>
              <div
                id="f-spice-group"
                role="radiogroup"
                aria-labelledby="spice-label"
                tabIndex={-1}
                className="flex flex-wrap gap-2 outline-none"
              >
                {[null, 0, 1, 2, 3, 4].map((n) => (
                  <label key={String(n)} className="relative">
                    <input
                      type="radio"
                      name="spice"
                      className="peer sr-only"
                      checked={v.spice === n}
                      onChange={() => set("spice", n)}
                      aria-label={n === null ? "Spice not set" : `Spice ${n} of 4, ${SPICE_LABELS[n].toLowerCase()}`}
                    />
                    <span
                      className={cn(
                        "inline-flex min-h-10 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-sheet border px-3 font-mono text-xs",
                        "border-line-strong text-ink transition-colors hover:border-herb",
                        "peer-checked:border-herb peer-checked:bg-herb peer-checked:text-on-herb",
                        "peer-focus-visible:ring-[3px] peer-focus-visible:ring-herb/30",
                      )}
                    >
                      {n === null ? "Not set" : n}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 font-mono text-[0.8125rem] text-ink-muted" aria-live="polite">
                {spiceLabel}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[0.8125rem] font-semibold">Allergens</p>
              {recipe && recipe.allergens.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="Allergens found in your ingredients">
                  {recipe.allergens.map((a) => (
                    <li
                      key={a}
                      className="rounded-sheet border border-paprika px-3 py-1.5 text-[0.8125rem] font-medium text-paprika-deep"
                    >
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <FieldHint>
                  Worked out from your ingredients when you save. You do not pick them, so they cannot be forgotten.
                </FieldHint>
              )}
            </div>
          </div>
        </Section>

        <Section n="07" title="Nutrition">
          <div className="rounded-xl border border-line bg-band px-4 py-4">
            <dl className="grid grid-cols-2 gap-3 font-mono sm:grid-cols-4">
              {["Calories", "Protein", "Carbs", "Fat"].map((label) => (
                <div key={label}>
                  <dt className="label-mono">{label}</dt>
                  <dd className="mt-1 text-lg text-ink-subtle">&mdash;</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[0.8125rem] leading-relaxed text-ink-muted">
              Estimate pending. Nutrition is calculated from your ingredients after review, never typed in.
            </p>
          </div>
        </Section>

        <Section n="08" title="Before you submit">
          <label htmlFor="f-rights" className="flex items-start gap-3 text-[0.9375rem] leading-relaxed">
            <input
              id="f-rights"
              type="checkbox"
              checked={v.rights}
              aria-invalid={invalid("rights")}
              onChange={(e) => set("rights", e.target.checked)}
              className="mt-1 size-5 shrink-0 accent-[var(--color-herb)]"
            />
            <span>
              I wrote this recipe myself (it is not copied from a book, site or video) and I am allowed to share it.
              Minced may show it publicly under the{" "}
              <Link href="/terms" className="underline underline-offset-4 hover:text-herb">
                Terms
              </Link>
              . Needed to submit for review; not needed to save a draft.
            </span>
          </label>
        </Section>

        {recipe && (
          <section aria-labelledby="danger-h" className="border-t border-line pt-6 pb-8">
            <h2 id="danger-h" className="text-xl">
              Delete this recipe
            </h2>
            {!confirmDelete ? (
              <>
                <p className="mt-1.5 text-[0.9375rem] text-ink-muted">
                  Removes it from your recipe book{status === "published" ? " and from the site" : ""}. This cannot be
                  undone.
                </p>
                <Button type="button" variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)} disabled={pending}>
                  Delete recipe
                </Button>
              </>
            ) : (
              <div role="alertdialog" aria-labelledby="del-q" className="mt-3 max-w-md rounded-xl border border-paprika/40 bg-paprika/5 p-4">
                <p id="del-q" className="text-[1.0625rem] font-semibold">
                  Delete &ldquo;{v.title.trim() || "this recipe"}&rdquo;?
                </p>
                <p className="mt-1 text-[0.9375rem] text-ink-muted">It will be gone for good.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" variant="danger" onClick={remove} disabled={pending} aria-disabled={pending}>
                    {pending ? "Deleting…" : "Yes, delete it"}
                  </Button>
                  <Button type="button" variant="secondary" autoFocus onClick={() => setConfirmDelete(false)} disabled={pending}>
                    Keep it
                  </Button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <div className="sticky bottom-0 z-30 -mx-(--gutter) mt-8 border-t border-line-strong bg-canvas/95 px-(--gutter) py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-canvas/85">
        <div className="mx-auto flex max-w-[820px] flex-wrap items-center gap-3">
          {/* Kept in the sticky bar so the reason is on screen wherever the focused field is. */}
          {err && (
            <div
              ref={errRef}
              tabIndex={-1}
              role="alert"
              className="w-full rounded-lg border border-paprika/50 bg-paprika/5 px-3.5 py-2.5 text-[0.9375rem] text-paprika-deep outline-none"
            >
              {err.message}
            </div>
          )}
          <p role="status" aria-live="polite" className="mr-auto min-w-0 text-[0.8125rem] text-ink-muted">
            {pending ? "Saving…" : (notice ?? (dirty ? "Unsaved changes" : ""))}
          </p>
          {(status === "new" || status === "draft") && (
            <>
              <Button type="button" variant="secondary" onClick={() => save(false)} disabled={pending} aria-disabled={pending}>
                Save draft
              </Button>
              <Button type="button" onClick={() => save(true)} disabled={pending} aria-disabled={pending}>
                Submit for review
              </Button>
            </>
          )}
          {status === "in_review" && (
            <>
              <Button type="button" variant="secondary" onClick={withdraw} disabled={pending} aria-disabled={pending}>
                Withdraw to drafts
              </Button>
              <Button type="button" onClick={() => save(true)} disabled={pending} aria-disabled={pending}>
                Save changes
              </Button>
            </>
          )}
          {status === "published" && (
            <Button type="button" onClick={() => save(true)} disabled={pending} aria-disabled={pending}>
              Save and send back to review
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
