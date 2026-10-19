"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { removeFridgeItem, updateFridgeItem } from "@/lib/actions/fridge";
import {
  addDays,
  daysUntil,
  expiryLabel,
  isIsoDate,
  shortDate,
  todayIso,
  urgencyOf,
  type Urgency,
} from "@/lib/fridgeDates";
import type { FridgeRow } from "@/lib/queries/fridge";
import { cn } from "@/lib/utils";

/**
 * The saved fridge, grouped by aisle, soonest expiry first inside each aisle.
 *
 * Client component because every row is editable in place and "Use these first"
 * depends on the visitor's own calendar day. The server sends rows and its own
 * date; after mount the browser's local date takes over, so "expires tomorrow"
 * is right in every timezone (first render uses the server date so server and
 * client HTML match).
 */

const AISLE_ORDER = ["Produce", "Protein", "Dairy", "Pantry", "Spices", "Other"];

const BADGE: Record<Urgency, string> = {
  // Paprika is for things that need action (handoff): only expired and urgent.
  expired: "border-paprika/40 bg-paprika/5 font-semibold text-paprika-deep",
  urgent: "border-paprika/40 bg-paprika/5 font-semibold text-paprika-deep",
  soon: "border-line-strong text-ink",
  ok: "border-transparent text-ink-muted",
  none: "border-transparent text-ink-subtle",
};

function byExpiry(a: FridgeRow, b: FridgeRow): number {
  if (a.expiresOn === b.expiresOn) return a.name.localeCompare(b.name);
  if (a.expiresOn === null) return 1;
  if (b.expiresOn === null) return -1;
  return a.expiresOn < b.expiresOn ? -1 : 1;
}

export function FridgeList({ initialRows, serverToday }: { initialRows: FridgeRow[]; serverToday: string }) {
  const [rows, setRows] = useState<FridgeRow[]>(initialRows);
  const [today, setToday] = useState(serverToday);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // The server re-sent rows (a save from the picker refreshed the page).
  const seed = JSON.stringify(initialRows);
  const [seenSeed, setSeenSeed] = useState(seed);
  if (seed !== seenSeed) {
    setSeenSeed(seed);
    setRows(initialRows);
  }

  useEffect(() => {
    setToday(todayIso());
  }, []);

  const sorted = useMemo(() => [...rows].sort(byExpiry), [rows]);
  const groups = useMemo(() => {
    const by = new Map<string, FridgeRow[]>();
    for (const r of sorted) {
      const key = AISLE_ORDER.includes(r.aisle) ? r.aisle : "Other";
      by.set(key, [...(by.get(key) ?? []), r]);
    }
    return AISLE_ORDER.flatMap((a) => (by.has(a) ? [{ aisle: a, rows: by.get(a)! }] : []));
  }, [sorted]);

  // "Use these first": everything at or under 2 days (expired included), at most
  // the 3 soonest; with nothing urgent, the single soonest dated item.
  const useFirst = useMemo(() => {
    const dated = sorted.filter((r) => r.expiresOn !== null);
    if (dated.length === 0) return [];
    const urgent = dated.filter((r) => daysUntil(r.expiresOn!, today) <= 2).slice(0, 3);
    return urgent.length > 0 ? urgent : dated.slice(0, 1);
  }, [sorted, today]);

  function patchLocal(id: string, patch: Partial<FridgeRow>) {
    setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function remove(row: FridgeRow) {
    setError(null);
    const before = rows;
    setRows((cur) => cur.filter((r) => r.id !== row.id));
    setEditing(null);
    try {
      const r = await removeFridgeItem(row.id);
      if (!r.ok) throw new Error("failed");
      setNote(`${row.name} removed`);
    } catch {
      setRows(before);
      setError(`Could not remove ${row.name}. Try again.`);
    }
  }

  async function save(row: FridgeRow, next: Pick<FridgeRow, "purchasedOn" | "expiresOn" | "quantity" | "notes">) {
    setError(null);
    const before = rows;
    patchLocal(row.id, next);
    setEditing(null);
    try {
      const r = await updateFridgeItem(row.id, next);
      if (!r.ok) throw new Error("failed");
      setNote(`${row.name} updated`);
    } catch {
      setRows(before);
      setError(`Could not save ${row.name}. Try again.`);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="max-w-[34em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Nothing in your fridge yet. Add what you have and Minced will suggest how long each thing
        keeps, so you can cook the soonest-to-expire first.
      </p>
    );
  }

  return (
    <div>
      {/* Screen-reader confirmation of edits and removals. */}
      <p role="status" aria-live="polite" className="sr-only">
        {note}
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface p-4">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-[1rem] font-semibold">Use these first</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-muted">
            {useFirst.length > 0 ? (
              <>
                Recipes that use{" "}
                <span className="text-ink">{useFirst.map((r) => r.name).join(", ")}</span>
                {daysUntil(useFirst[0].expiresOn!, today) <= 2
                  ? ", which need cooking soon."
                  : ", your next to expire."}
              </>
            ) : (
              "Add dates and Minced will point you at what to cook first."
            )}
          </p>
        </div>
        {useFirst.length > 0 && (
          <Link
            href="/pantry"
            className={buttonVariants({ variant: "primary", size: "md" })}
          >
            Find recipes
          </Link>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[0.875rem] text-paprika-deep">
          {error}
        </p>
      )}

      {/* Aisles flow into columns on wide screens, so a long fridge fills the page instead of one thin strip. */}
      <div className="mt-8 columns-1 gap-x-12 lg:columns-2 2xl:columns-3">
      {groups.map((g) => (
        <section key={g.aisle} aria-labelledby={`aisle-${g.aisle}`} className="mb-8 break-inside-avoid">
          <h2 id={`aisle-${g.aisle}`} className="label-mono mb-1">
            {g.aisle} <span className="text-ink-subtle">· {g.rows.length}</span>
          </h2>
          <ul className="flex flex-col">
            {g.rows.map((row) => (
              <FridgeRowView
                key={row.id}
                row={row}
                today={today}
                editing={editing === row.id}
                onEdit={() => setEditing(editing === row.id ? null : row.id)}
                onRemove={() => remove(row)}
                onSave={(next) => save(row, next)}
              />
            ))}
          </ul>
        </section>
      ))}
      </div>
    </div>
  );
}

function FridgeRowView({
  row,
  today,
  editing,
  onEdit,
  onRemove,
  onSave,
}: {
  row: FridgeRow;
  today: string;
  editing: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onSave: (next: Pick<FridgeRow, "purchasedOn" | "expiresOn" | "quantity" | "notes">) => void;
}) {
  const days = row.expiresOn ? daysUntil(row.expiresOn, today) : null;
  const urgency = urgencyOf(days);
  const id = useId();

  return (
    <li className="border-b border-line py-2.5">
      <div className="flex items-center gap-x-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1rem] font-medium">
            {row.name}
            {row.quantity && (
              <span className="ml-2 font-mono text-[0.75rem] font-normal text-ink-muted">
                {row.quantity}
              </span>
            )}
          </p>
          {row.notes && <p className="truncate text-[0.8125rem] text-ink-muted">{row.notes}</p>}
          <p
            className={cn(
              "mt-1 inline-flex min-h-8 max-w-full items-center rounded-sheet border px-2 font-mono text-[0.6875rem] whitespace-nowrap sm:px-2.5 sm:text-[0.75rem]",
              BADGE[urgency],
            )}
          >
            {expiryLabel(days)}
            {row.expiresOn && (
              <span className="ml-1.5 font-normal text-ink-muted">· {shortDate(row.expiresOn)}</span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onEdit}
            aria-expanded={editing}
            aria-label={`Edit ${row.name}`}
            className="inline-flex size-11 items-center justify-center rounded-md text-ink-muted transition-colors hover:text-herb"
          >
            <Pencil aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${row.name}`}
            className="inline-flex size-11 items-center justify-center rounded-md text-paprika-deep transition-colors hover:bg-paprika/10"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        </div>
      </div>

      {editing && <EditPanel key={id} row={row} today={today} onSave={onSave} onCancel={onEdit} />}
    </li>
  );
}

const FIELD =
  "min-h-11 w-full rounded-field border border-field bg-surface px-3 text-base text-ink focus-visible:border-herb focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-herb/20 sm:text-sm";

function EditPanel({
  row,
  today,
  onSave,
  onCancel,
}: {
  row: FridgeRow;
  today: string;
  onSave: (next: Pick<FridgeRow, "purchasedOn" | "expiresOn" | "quantity" | "notes">) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const [bought, setBought] = useState(row.purchasedOn ?? "");
  const [useBy, setUseBy] = useState(row.expiresOn ?? "");
  const [quantity, setQuantity] = useState(row.quantity ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");

  const base = isIsoDate(bought) ? bought : today;
  const suggestion = row.suggestedDays;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      purchasedOn: isIsoDate(bought) ? bought : null,
      expiresOn: isIsoDate(useBy) ? useBy : null,
      quantity: quantity.trim() || null,
      notes: notes.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg bg-band p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-bought`} className="label-mono mb-1 block">
            Bought
          </label>
          <input
            id={`${uid}-bought`}
            type="date"
            value={bought}
            onChange={(e) => setBought(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-useby`} className="label-mono mb-1 block">
            Use by
          </label>
          <input
            id={`${uid}-useby`}
            type="date"
            value={useBy}
            min={isIsoDate(bought) ? bought : undefined}
            onChange={(e) => setUseBy(e.target.value)}
            className={FIELD}
          />
          <div className="mt-1.5 flex flex-wrap gap-x-4">
            {suggestion !== null && (
              <button
                type="button"
                onClick={() => setUseBy(addDays(base, suggestion))}
                className="inline-flex min-h-11 items-center text-[0.8125rem] underline underline-offset-4 hover:text-herb"
              >
                Use the suggestion ({suggestion} {suggestion === 1 ? "day" : "days"} from {bought ? "purchase" : "today"})
              </button>
            )}
            {useBy && (
              <button
                type="button"
                onClick={() => setUseBy("")}
                className="inline-flex min-h-11 items-center text-[0.8125rem] text-ink-muted underline underline-offset-4 hover:text-herb"
              >
                No date
              </button>
            )}
          </div>
        </div>
        <div>
          <label htmlFor={`${uid}-qty`} className="label-mono mb-1 block">
            Amount (optional)
          </label>
          <input
            id={`${uid}-qty`}
            type="text"
            value={quantity}
            maxLength={60}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="2 lb, half a bag"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor={`${uid}-notes`} className="label-mono mb-1 block">
            Note (optional)
          </label>
          <input
            id={`${uid}-notes`}
            type="text"
            value={notes}
            maxLength={200}
            onChange={(e) => setNotes(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2.5">
        <Button type="submit" size="md">
          <Check aria-hidden className="size-4" />
          Save
        </Button>
        <Button type="button" size="md" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
