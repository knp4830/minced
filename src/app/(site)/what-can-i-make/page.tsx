import type { Metadata } from "next";
import Link from "next/link";
import { allCombos, comboPath, joinNames } from "@/lib/combos";

export const metadata: Metadata = {
  title: "What can I make with what I have",
  description:
    "Pick a few ingredients and see every recipe that uses all of them, fewest missing ingredients first.",
  alternates: { canonical: "/what-can-i-make" },
};

/** Index of every combination page: the way in for crawlers and for people browsing by ingredient. */
export default function WhatCanIMakeIndex() {
  const combos = allCombos();
  return (
    <div className="page-w py-8 md:py-12">
      <h1 className="text-[1.75rem] leading-[1.1] md:text-[2.25rem]">What can I make with what I have</h1>
      <p className="mt-3 max-w-[38em] text-[0.9375rem] leading-relaxed text-ink-muted">
        Common ingredient combinations, each with the recipes that use all of them. Want your own
        mix?{" "}
        <Link href="/pantry" className="underline underline-offset-4 hover:text-herb">
          Tap what is in your fridge
        </Link>
        .
      </p>
      <ul className="mt-8 grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {combos.map((c) => (
          <li key={c.slug}>
            <Link
              href={comboPath(c)}
              className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-2 text-[0.9375rem] hover:text-herb"
            >
              <span>{joinNames(c.names)}</span>
              <span className="font-mono text-[0.75rem] text-ink-subtle">{c.count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
