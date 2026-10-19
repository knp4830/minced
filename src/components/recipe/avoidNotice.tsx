"use client";

import { useEffect, useState } from "react";

import { useAccount } from "@/components/account/accountProvider";
import { joinNames, sentenceName, type AllergenInfo } from "@/lib/allergenInfo";

/*
 * "Contains peanuts, which you avoid." for a signed-in person who saved peanuts in Settings.
 *
 * Recipe pages are cached and identical for everyone, so the personal part is a small client island that asks
 * /api/me/allergens after load (only when the account provider says someone is signed in). A signed-out visitor
 * sees the plain "Contains peanuts" chips from the server and nothing here. The saved list is remembered in memory
 * for 30 seconds so paging through recipes does not repeat the request.
 */

let memo: { at: number; slugs: string[] } | null = null;
const MEMO_MS = 30_000;

async function loadAvoided(): Promise<string[]> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.slugs;
  const res = await fetch("/api/me/allergens", { cache: "no-store" });
  if (!res.ok) return [];
  const body = (await res.json()) as { allergens?: unknown };
  const slugs = Array.isArray(body.allergens) ? body.allergens.filter((s): s is string => typeof s === "string") : [];
  memo = { at: Date.now(), slugs };
  return slugs;
}

export function AvoidNotice({ info }: { info: AllergenInfo[] }) {
  const { status } = useAccount();
  const [avoided, setAvoided] = useState<string[]>([]);

  useEffect(() => {
    if (status !== "in") {
      setAvoided([]);
      return;
    }
    let cancelled = false;
    loadAvoided()
      .then((s) => {
        if (!cancelled) setAvoided(s);
      })
      .catch(() => {
        /* a failed lookup shows the plain chips; it never hides them */
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  const hits = info.filter((a) => avoided.includes(a.slug));
  if (hits.length === 0) return null;

  const contains = hits.filter((a) => !a.optionalOnly);
  const optional = hits.filter((a) => a.optionalOnly);

  return (
    <div
      role="alert"
      data-avoid-notice
      className="mt-3 rounded-md border border-paprika bg-paprika/10 px-3 py-2.5 text-[0.875rem] leading-snug text-paprika-deep"
    >
      {contains.map((a) => (
        <p key={a.slug} className="font-semibold">
          {a.basis === "varies" ? "May contain" : "Contains"} {sentenceName(a.name)}, which you avoid.
          {a.sources.length > 0 && (
            <span className="ml-1 font-normal">
              {a.basis === "varies" ? "Some brands or versions of " : "From "}
              {joinNames(a.sources)}.
            </span>
          )}
        </p>
      ))}
      {optional.map((a) => (
        <p key={a.slug} className={contains.length > 0 ? "mt-1" : ""}>
          <span className="font-semibold">
            {a.sources.length > 0 ? `Optional here: ${joinNames(a.sources)}.` : `${a.name}: optional here.`}
          </span>{" "}
          You avoid {sentenceName(a.name)}, so leave it out.
        </p>
      ))}
    </div>
  );
}
