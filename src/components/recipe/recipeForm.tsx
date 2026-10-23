"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { FieldHint, Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FoodCombobox } from "@/components/food/foodCombobox";
import { NutritionPreview } from "@/components/recipe/nutritionPreview";
import {
  autosaveRecipe,
  checkIngredientName,
  deleteRecipe,
  ingredientsWithoutNutrition,
  saveRecipe,
  withdrawRecipe,
  type AutosaveResult,
} from "@/lib/actions/myRecipes";
import type { FoodHit } from "@/lib/foodHit";
import { foodTitle } from "@/lib/foodTitle";
import {
  AUTOSAVE,
  EMPTY_INGREDIENT,
  LIMITS,
  SPICE_LABELS,
  autosaveReadiness,
  autosaveText,
  backupKey,
  parseBackup,
  valuesSignature,
  type AutosaveState,
  type FormOptions,
  type IngredientRow,
  type LocalBackup,
  type RecipeFormValues,
  type RecipeStatus,
} from "@/lib/recipeForm";
import { cn } from "@/lib/utils";
import { SLUG_RE } from "@/lib/validate";

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

/**
 * The part of an ingredient row that is saved: the five fields plus the picked food when there is one.
 * Display-only fields (the brand label, the "no nutrition" flag) are left out, so they never make a
 * form look edited. The unsaved-changes check compares these.
 */
function rowCore(r: IngredientRow): IngredientRow {
  const core: IngredientRow = { quantity: r.quantity, unit: r.unit, name: r.name, note: r.note, optional: r.optional };
  if (typeof r.fdcId === "number") core.fdcId = r.fdcId;
  return core;
}
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

/** Set in this tab when autosave opens a draft from /recipes/new, so a reload can offer to continue it. */
const RESUME_KEY = "minced:new-draft";

/** "just now", "5 minutes ago", "2 hours ago", "yesterday" - for the restore banner. */
function agoText(at: number): string {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

function fieldId(field: string | undefined): string | null {
  if (!field) return null;
  const ing = /^ingredient:(\d+)$/.exec(field);
  if (ing) return `ing-${ing[1]}-name`;
  const qty = /^ingredient_qty:(\d+)$/.exec(field);
  if (qty) return `ing-${qty[1]}-qty`;
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
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  const current = (): RecipeFormValues => ({
    ...v,
    ingredients: ings.map(rowCore),
    steps: steps.map((s) => s.text),
  });
  const sig = valuesSignature(current());

  // Draft autosave (M5.2) -------------------------------------------------------
  // `savedSigRef` is the last state the database is known to hold. A recipe made by the first autosave gets
  // its id before the page's props know it, so the id lives in a ref too (timers and queued saves read the
  // ref, never a stale render).
  const savedSigRef = useRef(valuesSignature(initial));
  const dirty = sig !== savedSigRef.current;
  const [rid, setRid] = useState<string | null>(recipe?.id ?? null);
  const ridRef = useRef<string | null>(recipe?.id ?? null);
  const status: RecipeStatus | "new" = recipe?.status ?? (rid ? "draft" : "new");
  // Only a draft (or a recipe that does not exist yet) saves by itself. A published or in-review recipe keeps
  // its explicit Save, because saving it changes what is public or queued.
  const canAutosave = recipe === null || recipe.status === "draft";
  const [auto, setAuto] = useState<AutosaveState>({ kind: "idle" });
  const [skipped, setSkipped] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [restorable, setRestorable] = useState<LocalBackup | null>(null);
  const [resume, setResume] = useState<{ slug: string; title: string } | null>(null);
  const latest = useRef({ values: current(), sig });
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failsRef = useRef(0);
  const stoppedRef = useRef(false);
  const skippedRef = useRef(0);
  const autosaveRef = useRef<() => void>(() => {});

  // A reopened recipe: ask once which of its saved ingredients have no nutrition data, so the same hint a fresh
  // pick shows is there too. Rows with a chosen brand are skipped (they were picked for their data).
  useEffect(() => {
    const names = initial.ingredients.filter((i) => i.name.trim() !== "" && typeof i.fdcId !== "number").map((i) => i.name);
    if (names.length === 0) return;
    let live = true;
    void ingredientsWithoutNutrition(names).then((none) => {
      if (!live || !none || none.length === 0) return;
      const set = new Set(none);
      setIngs((rows) => rows.map((r) => (typeof r.fdcId !== "number" && set.has(r.name.trim().toLowerCase()) ? { ...r, noNutrition: true } : r)));
    });
    return () => {
      live = false;
    };
    // initial is the saved recipe; this runs once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before closing a tab with work the database does not have yet (including half-typed lines autosave left out).
  const unsaved = dirty || skipped > 0;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  useEffect(() => {
    latest.current = { values: current(), sig };
    // runs after every render so timers and queued saves always read the newest form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  function clearTimers() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    timerRef.current = null;
    maxTimerRef.current = null;
  }

  /** Quiet period after the last keystroke, but never longer than maxWaitMs for someone typing steadily. */
  function schedule(ms: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => autosaveRef.current(), ms);
    if (!maxTimerRef.current) maxTimerRef.current = setTimeout(() => autosaveRef.current(), AUTOSAVE.maxWaitMs);
  }

  /** One save at a time, so a manual save and an autosave can never both create the same new recipe. */
  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = queueRef.current.then(fn, fn);
    queueRef.current = next.catch(() => undefined);
    return next;
  }

  /**
   * A copy of the whole form in this browser, kept while the database does not have everything: a save is
   * pending, failed, or left out half-typed lines. A safety net only (storage can be blocked or cleared).
   */
  function syncBackup() {
    try {
      const key = backupKey(ridRef.current);
      const { values, sig: now } = latest.current;
      if (now !== savedSigRef.current || skippedRef.current > 0) {
        window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), values }));
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      /* storage blocked or full: autosave still works */
    }
  }

  function retryLater() {
    const wait = AUTOSAVE.retryMs[Math.min(failsRef.current, AUTOSAVE.retryMs.length - 1)];
    failsRef.current += 1;
    setAuto({ kind: "retrying" });
    if (failsRef.current === 1) setLiveText(autosaveText({ kind: "retrying" }));
    syncBackup();
    schedule(wait);
  }

  async function autosaveNow() {
    clearTimers();
    if (!canAutosave || stoppedRef.current) return;
    if (latest.current.sig === savedSigRef.current) return; // nothing changed since the last save
    await enqueue(async () => {
      const { values, sig: sent } = latest.current; // read late: an earlier save in the queue may have just finished
      if (stoppedRef.current || sent === savedSigRef.current) return;
      const ready = autosaveReadiness(values);
      if (!ready.ready) {
        setAuto({ kind: "waiting", waitingFor: ready.waitingFor });
        return;
      }
      setNotice(null);
      setAuto({ kind: "saving" });
      let res: AutosaveResult | null = null;
      try {
        res = await autosaveRecipe(ridRef.current, values);
      } catch {
        res = null; // the request itself failed (offline, server restarting): try again
      }
      if (res === null || (!res.ok && res.reason === "transient")) return retryLater();
      if (res.ok) {
        failsRef.current = 0;
        const wasNew = ridRef.current === null;
        ridRef.current = res.id;
        setRid(res.id);
        if (wasNew) {
          try {
            window.localStorage.removeItem(backupKey(null));
          } catch {
            /* ignore */
          }
        }
        // The address stays /recipes/new on purpose: moving it to the edit page would make the router render a
        // different route and rebuild this form mid-sentence. A reload in this tab offers the draft back instead.
        if (recipe === null) {
          try {
            window.sessionStorage.setItem(RESUME_KEY, JSON.stringify({ slug: res.slug, title: values.title.trim() }));
          } catch {
            /* ignore */
          }
        }
        savedSigRef.current = sent;
        skippedRef.current = res.skipped;
        setSkipped(res.skipped);
        setAuto({ kind: "saved", skipped: res.skipped });
        setLiveText(res.skipped > 0 ? autosaveText({ kind: "saved", skipped: res.skipped }) : "Draft saved");
        syncBackup();
        // More was typed while this save was on its way: go again soon, nothing is dropped.
        if (latest.current.sig !== sent) schedule(400);
        return;
      }
      if (res.reason === "waiting") {
        setAuto({ kind: "waiting", waitingFor: res.message === "servings" ? "servings" : "title" });
        return;
      }
      // The database said no in words meant for a person, or the recipe changed under us. "invalid" is tried
      // again at the next edit; signed-out, deleted, off or no-longer-a-draft stop the autosave for good.
      if (res.reason !== "invalid") stoppedRef.current = true;
      setAuto({ kind: "stopped", message: res.message });
      setLiveText(res.message);
      syncBackup();
    });
  }
  useEffect(() => {
    autosaveRef.current = () => void autosaveNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Each change: save soon, and keep the device copy fresh.
  useEffect(() => {
    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(syncBackup, 400);
    if (!canAutosave || stoppedRef.current) return;
    if (sig === savedSigRef.current) return;
    schedule(AUTOSAVE.quietMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Leaving (another tab, a closed window, or a link inside the app): save what is pending right now.
  useEffect(() => {
    const flush = () => {
      syncBackup();
      autosaveRef.current();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const onOnline = () => {
      if (latest.current.sig !== savedSigRef.current) autosaveRef.current();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("online", onOnline);
      clearTimers();
      if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A copy left on this device that the database does not have (a closed tab, a failed save): offer it back.
  useEffect(() => {
    try {
      const b = parseBackup(window.localStorage.getItem(backupKey(recipe?.id ?? null)));
      if (b && valuesSignature(b.values) !== valuesSignature(initial)) setRestorable(b);
    } catch {
      /* storage blocked */
    }
    // once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /recipes/new reloaded after autosave made a draft in this tab: offer to continue it rather than start blank.
  useEffect(() => {
    if (recipe !== null) return;
    try {
      const raw = window.sessionStorage.getItem(RESUME_KEY);
      const o = raw ? (JSON.parse(raw) as { slug?: unknown; title?: unknown }) : null;
      if (o && typeof o.slug === "string" && SLUG_RE.test(o.slug)) {
        setResume({ slug: o.slug, title: typeof o.title === "string" ? o.title : "" });
      }
    } catch {
      /* storage blocked */
    }
    // once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function startFresh() {
    try {
      window.sessionStorage.removeItem(RESUME_KEY);
    } catch {
      /* ignore */
    }
    setResume(null);
    setFocusId("f-title");
  }

  function restoreBackup() {
    if (!restorable) return;
    const b = restorable.values;
    setV({ ...b });
    setIngs(b.ingredients.map((i) => ({ ...i, key: nextKey() })));
    setSteps(b.steps.map((text) => ({ text, key: nextKey() })));
    setRestorable(null);
    setFocusId("f-title");
  }
  function discardBackup() {
    try {
      window.localStorage.removeItem(backupKey(recipe?.id ?? null));
    } catch {
      /* ignore */
    }
    setRestorable(null);
    setFocusId("f-title");
  }

  // Focus management: after adding a row, and when an error names a field.
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  // Closing the delete confirmation returns focus to the button that opened it.
  useEffect(() => {
    if (wasConfirming.current && !confirmDelete) deleteBtnRef.current?.focus();
    wasConfirming.current = confirmDelete;
  }, [confirmDelete]);

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

  /** A suggestion was chosen: the line becomes the canonical ingredient, and a brand/food pick rides along. */
  function pickFood(key: number, hit: FoodHit) {
    const canonical = (hit.canonicalName ?? hit.label).trim();
    const isFood = hit.kind === "food" && hit.fdcId !== null;
    updateIng(key, {
      name: canonical,
      fdcId: isFood ? hit.fdcId : null,
      foodLabel: isFood ? foodTitle(hit) : undefined,
      noNutrition: hit.hasNutrition === false,
    });
    setKnown((k) => ({ ...k, [canonical.toLowerCase()]: canonical.toLowerCase() }));
  }

  async function checkName(name: string) {
    const clean = name.replace(/\s+/g, " ").trim();
    const lower = clean.toLowerCase();
    if (!clean || known[lower] !== undefined) return;
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
  function save(toReview: boolean) {
    setErr(null);
    setNotice(null);
    clearTimers();
    startTransition(async () => {
      const values = current();
      const valuesSig = valuesSignature(values);
      // Behind any autosave already on its way, so a brand new recipe is created once, not twice.
      const res = await enqueue(() => saveRecipe(ridRef.current, values, toReview));
      if (!res.ok) {
        setErr({ message: res.message, field: res.field });
        return;
      }
      const wasNew = ridRef.current === null;
      if (res.id) {
        ridRef.current = res.id;
        setRid(res.id);
      }
      savedSigRef.current = valuesSig;
      skippedRef.current = 0;
      setSkipped(0);
      setAuto({ kind: "idle" });
      try {
        window.localStorage.removeItem(backupKey(null));
        if (res.id) window.localStorage.removeItem(backupKey(res.id));
        window.sessionStorage.removeItem(RESUME_KEY);
      } catch {
        /* ignore */
      }
      if (res.warning) setNotice(res.warning);
      if (res.status === "in_review" && status !== "in_review" && status !== "published") {
        stoppedRef.current = true; // submitted: it is no longer a draft, and this page is about to close
        router.push("/account?tab=book&notice=submitted");
      } else if (status === "new" && wasNew) {
        stoppedRef.current = true; // the edit page takes over
        router.replace(`/recipes/${res.slug}/edit?saved=1`);
      } else {
        setNotice(res.status === "in_review" ? "Saved. Your recipe is waiting for review." : "Draft saved.");
        // A recipe the server rendered re-reads its saved state; a draft that autosave opened here has nothing new to read.
        if (recipe) router.refresh();
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
      stoppedRef.current = true;
      savedSigRef.current = sig; // nothing left to lose
      skippedRef.current = 0;
      try {
        window.localStorage.removeItem(backupKey(recipe.id));
      } catch {
        /* ignore */
      }
      router.push("/account?tab=book&notice=deleted");
    });
  }

  const spiceLabel = v.spice === null ? "Not set" : `${v.spice} / 4 — ${SPICE_LABELS[v.spice].toLowerCase()}`;
  const total = (Number(v.prep) || 0) + (Number(v.cook) || 0);

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
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

      {resume && !restorable && (
        <div role="group" aria-labelledby="resume-q" className="mt-5 rounded-lg border border-herb bg-surface px-4 py-3 text-[0.9375rem]">
          <p id="resume-q" className="font-semibold">
            {resume.title ? `“${resume.title}” is saved as a draft.` : "Your recipe is saved as a draft."}
          </p>
          <p className="mt-1 text-ink-muted">Pick up where you left off, or start a new one.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href={`/recipes/${resume.slug}/edit`}
              className={buttonVariants()}
            >
              Continue editing
            </Link>
            <Button type="button" variant="secondary" onClick={startFresh}>
              Start a new recipe
            </Button>
          </div>
        </div>
      )}
      {restorable && (
        <div role="group" aria-labelledby="restore-q" className="mt-5 rounded-lg border border-herb bg-surface px-4 py-3 text-[0.9375rem]">
          <p id="restore-q" className="font-semibold">
            We kept some changes from this device.
          </p>
          <p className="mt-1 text-ink-muted">
            They were made {agoText(restorable.at)} and had not reached your draft. Bring them back?
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button type="button" onClick={restoreBackup}>
              Bring them back
            </Button>
            <Button type="button" variant="secondary" onClick={discardBackup}>
              No thanks
            </Button>
          </div>
        </div>
      )}
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
              const counted = typeof res === "string" && res !== "pending" && res !== lower;
              const hasHint = unresolved || counted || Boolean(row.foodLabel) || Boolean(row.noNutrition);
              return (
                <li
                  key={row.key}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface p-3 sm:grid-cols-[4.5rem_6.5rem_minmax(0,1fr)_9rem_6.75rem] sm:items-start sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <Input
                    id={`ing-${n}-qty`}
                    mono
                    aria-label={`Ingredient ${n} amount`}
                    aria-invalid={invalid(`ingredient_qty:${n}`)}
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
                    <FoodCombobox
                      inputId={`ing-${n}-name`}
                      ariaLabel={`Ingredient ${n} name`}
                      placeholder="Ingredient, e.g. onion"
                      value={row.name}
                      maxLength={LIMITS.nameMax}
                      invalid={unresolved || Boolean(invalid(`ingredient:${n}`))}
                      describedBy={hasHint ? hintId : undefined}
                      onValueChange={(text) => updateIng(row.key, { name: text, fdcId: null, foodLabel: undefined, noNutrition: undefined })}
                      onPick={(hit) => pickFood(row.key, hit)}
                      onBlurText={(text) => void checkName(text)}
                    />
                    {unresolved && (
                      <FieldHint id={hintId} error>
                        &ldquo;{row.name.trim()}&rdquo; is not in our ingredient list. Pick a suggestion or try a simpler
                        name.
                      </FieldHint>
                    )}
                    {!unresolved && hasHint && (
                      <FieldHint id={hintId}>
                        {counted ? `Counted as ${res}. ` : ""}
                        {row.foodLabel ? `Using: ${row.foodLabel}. ` : ""}
                        {row.noNutrition ? "No nutrition data for this yet, so it will not add to the recipe's calories." : ""}
                      </FieldHint>
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
          <NutritionPreview rows={ings} servings={v.servings} />
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
                <Button ref={deleteBtnRef} type="button" variant="danger" className="mt-3" onClick={() => setConfirmDelete(true)} disabled={pending}>
                  Delete recipe
                </Button>
              </>
            ) : (
              <div
                role="alertdialog"
                aria-labelledby="del-q"
                onKeyDown={(e) => {
                  if (e.key === "Escape" && !pending) {
                    e.stopPropagation();
                    setConfirmDelete(false);
                  }
                }}
                className="mt-3 max-w-md rounded-xl border border-paprika/40 bg-paprika/5 p-4">
                <p id="del-q" className="text-[1.0625rem] font-semibold">
                  Delete &ldquo;{v.title.trim() || "this recipe"}&rdquo;?
                </p>
                <p className="mt-1 text-[0.9375rem] text-ink-muted">It will be gone for good.</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="button" variant="danger" onClick={remove} disabled={pending}>
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
          {/* Seen text: every state. Heard text: only the ones worth interrupting for (saved, trouble), never "Saving…". */}
          <p
            data-save-status
            className={cn(
              "mr-auto min-w-0 text-[0.8125rem]",
              auto.kind === "retrying" || auto.kind === "stopped" ? "text-saffron-ink" : "text-ink-muted",
            )}
          >
            {pending || auto.kind === "saving"
              ? "Saving…"
              : (notice ??
                (canAutosave
                  ? // "Saved" would be stale the moment someone types again; say nothing until the next save.
                    auto.kind === "saved" && dirty
                    ? ""
                    : autosaveText(auto)
                  : dirty
                    ? "Unsaved changes"
                    : ""))}
          </p>
          <p role="status" aria-live="polite" className="sr-only">
            {liveText}
          </p>
          {(status === "new" || status === "draft") && (
            <>
              <Button type="button" variant="secondary" onClick={() => save(false)} disabled={pending}>
                Save draft
              </Button>
              <Button type="button" onClick={() => save(true)} disabled={pending}>
                Submit for review
              </Button>
            </>
          )}
          {status === "in_review" && (
            <>
              <Button type="button" variant="secondary" onClick={withdraw} disabled={pending}>
                Withdraw to drafts
              </Button>
              <Button type="button" onClick={() => save(true)} disabled={pending}>
                Save changes
              </Button>
            </>
          )}
          {status === "published" && (
            <Button type="button" onClick={() => save(true)} disabled={pending}>
              Save and send back to review
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
