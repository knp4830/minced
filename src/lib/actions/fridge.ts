"use server";

import { revalidatePath } from "next/cache";

import { isIsoDate, todayIso } from "@/lib/fridgeDates";
import { MAX_INT4 } from "@/lib/filters";
import {
  addToFridge,
  deleteFridgeRow,
  replaceFridge,
  updateFridgeRow,
  type FridgePatch,
  type FridgeWriteResult,
} from "@/lib/queries/fridgeWrite";

/*
 * Server actions for the saved fridge. They are public HTTP endpoints, so every
 * argument is re-validated here no matter what the UI sends.
 */

const MAX_ITEMS = 150;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

function cleanIds(ids: unknown): number[] | null {
  if (!Array.isArray(ids) || ids.length > MAX_ITEMS) return null;
  const out = [...new Set(ids)];
  if (!out.every((n): n is number => Number.isInteger(n) && n > 0 && n <= MAX_INT4)) return null;
  return out;
}

/**
 * The client's calendar day, used to date new items. Trusted only within a day
 * either side of the server's clock (timezones), otherwise the server's own day.
 */
function cleanToday(today: unknown): string {
  const server = todayIso(new Date());
  if (!isIsoDate(today)) return server;
  const off = Math.abs(Date.parse(`${today}T00:00:00Z`) - Date.parse(`${server}T00:00:00Z`));
  return off <= 2 * DAY_MS ? today : server;
}

function done(r: FridgeWriteResult): FridgeWriteResult {
  if (r.ok) revalidatePath("/fridge");
  return r;
}

/** Make the saved fridge exactly this set of ingredient ids. */
export async function saveFridge(ids: number[], today?: string): Promise<FridgeWriteResult> {
  const clean = cleanIds(ids);
  if (!clean) return { ok: false, reason: "failed" };
  return done(await replaceFridge(clean, cleanToday(today)));
}

/** Add ids to the saved fridge, keeping what is there (importing a browser's local fridge). */
export async function importToFridge(ids: number[], today?: string): Promise<FridgeWriteResult> {
  const clean = cleanIds(ids);
  if (!clean) return { ok: false, reason: "failed" };
  return done(await addToFridge(clean, cleanToday(today)));
}

function dateOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return isIsoDate(v) ? v : undefined;
}

function textOrNull(v: unknown, max: number): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t.slice(0, max);
}

/** Edit one fridge row's dates, amount or note. Unknown or invalid fields are ignored. */
export async function updateFridgeItem(id: string, patch: FridgePatch): Promise<FridgeWriteResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, reason: "failed" };
  const p = (patch ?? {}) as Record<string, unknown>;
  const clean: FridgePatch = {};
  const purchasedOn = dateOrNull(p.purchasedOn);
  const expiresOn = dateOrNull(p.expiresOn);
  const quantity = textOrNull(p.quantity, 60);
  const notes = textOrNull(p.notes, 200);
  // A use-by date before the purchase date is a typo, not food that expired before it was
  // bought. ISO dates compare correctly as strings. The form also sets min= on the field.
  if (purchasedOn && expiresOn && expiresOn < purchasedOn) return { ok: false, reason: "failed" };
  if (purchasedOn !== undefined) clean.purchasedOn = purchasedOn;
  if (expiresOn !== undefined) clean.expiresOn = expiresOn;
  if (quantity !== undefined) clean.quantity = quantity;
  if (notes !== undefined) clean.notes = notes;
  return done(await updateFridgeRow(id, clean));
}

export async function removeFridgeItem(id: string): Promise<FridgeWriteResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, reason: "failed" };
  return done(await deleteFridgeRow(id));
}
