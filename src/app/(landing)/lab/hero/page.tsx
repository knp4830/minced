import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  DM_Sans,
  DM_Serif_Display,
  Figtree,
  Nunito_Sans,
  Plus_Jakarta_Sans,
  Young_Serif,
} from "next/font/google";
import { HeroOption, type LabVariant } from "@/components/landing/heroLab";
import { getLandingPhotos } from "@/lib/queries/landing";

/*
 * Hidden design lab: five hero options side by side. noindex, not linked, not in the
 * sitemap. Fonts load through next/font here only, so the live landing page and the
 * rest of the site download none of them. Option A reuses the root layout's fonts.
 */
export const metadata: Metadata = {
  title: "Hero options (lab)",
  robots: { index: false, follow: false },
};
export const revalidate = 3600;

const dmSerif = DM_Serif_Display({ variable: "--lab-dm-serif", subsets: ["latin"], weight: "400", display: "swap" });
const dmSans = DM_Sans({ variable: "--lab-dm-sans", subsets: ["latin"], display: "swap" });
const bricolage = Bricolage_Grotesque({ variable: "--lab-bricolage", subsets: ["latin"], display: "swap" });
const figtree = Figtree({ variable: "--lab-figtree", subsets: ["latin"], display: "swap" });
const youngSerif = Young_Serif({ variable: "--lab-young", subsets: ["latin"], weight: "400", display: "swap" });
const nunito = Nunito_Sans({ variable: "--lab-nunito", subsets: ["latin"], display: "swap" });
const jakarta = Plus_Jakarta_Sans({ variable: "--lab-jakarta", subsets: ["latin"], display: "swap" });

const VARIANTS: LabVariant[] = [
  {
    id: "A",
    name: "Split with a photo mosaic (today’s fonts)",
    pairing: "Fraunces for headings, Public Sans for text, IBM Plex Mono for numbers. Already on the site.",
    layout: "Text and search on the left, one large dish photo plus five small ones on the right.",
    rationale:
      "The safe pick. Fraunces gives the headline a warm, editorial feel; Plex Mono keeps the numbers feeling measured. Nothing new to load.",
    cost: "No extra download. These three fonts already ship on every page.",
    fontClass: "",
    display: "var(--font-fraunces), 'Iowan Old Style', Georgia, serif",
    sans: "var(--font-public-sans), system-ui, sans-serif",
  },
  {
    id: "B",
    name: "Centered, search first",
    pairing: "DM Serif Display for headings, DM Sans for text.",
    layout: "Everything centered: headline, big search box, quick filter chips, then a row of five tall photos.",
    rationale:
      "Puts the one thing most people came to do, searching, in the middle of the screen. DM Serif Display is a high-contrast display serif that stays crisp at hero size, and DM Sans is a friendly geometric partner.",
    cost: "Light. DM Serif Display is a single weight (about 20 KB) and DM Sans is one variable file.",
    fontClass: `${dmSerif.variable} ${dmSans.variable}`,
    display: "var(--lab-dm-serif), Georgia, serif",
    sans: "var(--lab-dm-sans), system-ui, sans-serif",
  },
  {
    id: "C",
    name: "Bay green hero",
    pairing: "Bricolage Grotesque for headings, Figtree for text.",
    layout: "Full-width green panel with light text, search and chips on the left, three stacked photos on the right.",
    rationale:
      "Continues the green nav straight into the page, so the top of the screen feels like one confident block. Bricolage is a characterful grotesque with a hand-cut feel, good for a modern, energetic brand; Figtree is clean and very readable at small sizes.",
    cost: "Moderate. Both are variable fonts, one file each, with no italics.",
    fontClass: `${bricolage.variable} ${figtree.variable}`,
    display: "var(--lab-bricolage), system-ui, sans-serif",
    sans: "var(--lab-figtree), system-ui, sans-serif",
  },
  {
    id: "D",
    name: "Photo-led with a floating card",
    pairing: "Young Serif for headings, Nunito Sans for text.",
    layout: "One wide dish photo fills the hero; the headline and search sit on a card that overlaps it.",
    rationale:
      "Leads with appetite: the food is the first thing you see. Young Serif is soft and a little old-fashioned, which suits the warm, story-friendly tone; Nunito Sans is rounded and gentle.",
    cost: "Light. Young Serif is one weight; Nunito Sans is one variable file.",
    fontClass: `${youngSerif.variable} ${nunito.variable}`,
    display: "var(--lab-young), Georgia, serif",
    sans: "var(--lab-nunito), system-ui, sans-serif",
  },
  {
    id: "E",
    name: "App-first, one family",
    pairing: "Plus Jakarta Sans for both headings and text.",
    layout: "Headline, search and quick filters on the left; a two-by-two grid of captioned recipe photos on the right.",
    rationale:
      "Reads like a product, not a magazine, which suits the gym and healthy-eating crowd. One family means one download and a consistent feel; the heavy weights carry the headline without needing a second typeface.",
    cost: "Lightest of the new options: a single variable font file for everything except the mono.",
    fontClass: jakarta.variable,
    display: "var(--lab-jakarta), system-ui, sans-serif",
    sans: "var(--lab-jakarta), system-ui, sans-serif",
  },
];

export default async function HeroLab() {
  const photos = await getLandingPhotos();
  return (
    <>
      <div className="page-w py-8 md:py-12">
        <p className="label-mono mb-2">Design lab, not public</p>
        <h1 className="mb-3 text-3xl md:text-4xl">Hero options</h1>
        <p className="max-w-[40rem] text-ink-muted">
          Five font pairings and layouts, all using the same words and the same live photos.
          Pick one by letter. The live landing page still uses option A’s fonts.
        </p>
      </div>
      {VARIANTS.map((v) => (
        <HeroOption key={v.id} v={v} photos={photos} />
      ))}
    </>
  );
}
