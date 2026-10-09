import { Bookmark, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardMedia,
  CardTitle,
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { FieldHint, Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MetaRow } from "@/components/ui/metaRow";
import { Select } from "@/components/ui/select";
import { SpiceDots } from "@/components/ui/spiceDots";
import { Textarea } from "@/components/ui/textarea";

// Dev-only reference page. Delete before launch (BUILD-PLAN M2.2).
export const metadata: Metadata = {
  title: "Kitchen sink",
  robots: { index: false, follow: false },
};

const swatches: { name: string; cls: string; note: string }[] = [
  { name: "canvas", cls: "bg-canvas", note: "page" },
  { name: "surface", cls: "bg-surface", note: "cards, inputs" },
  { name: "panel", cls: "bg-panel", note: "tiles on a band" },
  { name: "band", cls: "bg-band", note: "section band" },
  { name: "sunken", cls: "bg-sunken", note: "search field" },
  { name: "track", cls: "bg-track", note: "slider rail" },
  { name: "herb", cls: "bg-herb", note: "action" },
  { name: "herb-deep", cls: "bg-herb-deep", note: "pressed" },
  { name: "paprika", cls: "bg-paprika", note: "heat, allergens" },
  { name: "saffron", cls: "bg-saffron", note: "accent on dark" },
  { name: "saffron-tint", cls: "bg-saffron-tint", note: "cost chip" },
  { name: "ink", cls: "bg-ink", note: "text" },
  { name: "ink-muted", cls: "bg-ink-muted", note: "secondary" },
  { name: "ink-subtle", cls: "bg-ink-subtle", note: "labels" },
  { name: "stone", cls: "bg-stone", note: "icons only" },
  { name: "stone-line", cls: "bg-stone-line", note: "separators" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="py-10 first:pt-0 md:py-12">
      <h2
        id={id}
        className="mb-6 border-b border-line pb-3 text-2xl md:text-[1.75rem]"
      >
        {title}
      </h2>
      <div className="space-y-8">{children}</div>
    </section>
  );
}

function Specimen({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="label-mono mb-3">{label}</p>
      {children}
    </div>
  );
}

export default function KitchenSinkPage() {
  return (
    <div className="mx-auto max-w-[1100px] px-(--gutter) py-10 md:py-14">
      <header className="mb-10 max-w-2xl">
        <h1 className="text-[2rem] leading-[1.05] md:text-5xl">Kitchen sink</h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          Every primitive, every state. Tokens live in{" "}
          <code className="font-mono text-[0.85em] text-herb">globals.css</code>
          ; components in{" "}
          <code className="font-mono text-[0.85em] text-herb">
            src/components/ui
          </code>
          . Delete this route before launch.
        </p>
      </header>

      <Section id="color" title="Colour">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {swatches.map((s) => (
            <li key={s.name}>
              <div
                className={`${s.cls} h-14 rounded-lg border border-line-strong`}
              />
              <p className="mt-2 font-mono text-xs font-medium">{s.name}</p>
              <p className="text-xs text-ink-subtle">{s.note}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="type" title="Type">
        <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
          <Specimen label="Fraunces · display">
            <p className="font-display text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.025em] md:text-6xl">
              Find the recipe. Skip the life story.
            </p>
            <p className="mt-4 font-display text-xl font-semibold tracking-[-0.01em]">
              Chana Masala
            </p>
          </Specimen>
          <div className="space-y-8">
            <Specimen label="Public Sans · body">
              <p className="max-w-[34em] text-[1.0625rem] leading-relaxed text-ink-soft">
                Filter by ingredients, nutrition, cookware, time, cost, and
                diet — then get a shopping list in seconds. Everything measured
                before you commit.
              </p>
              <p className="mt-3 text-sm leading-normal text-ink-muted">
                Soften onion in oil over medium heat, 6–7 min.
              </p>
            </Specimen>
            <Specimen label="IBM Plex Mono · measurements">
              <p className="font-mono text-sm">
                1,240 recipes · 18 filters · 0 backstories
              </p>
              <p className="mt-1 font-mono text-sm">
                1½ cups · 400 g · 350 °F · 35 min
              </p>
            </Specimen>
          </div>
        </div>
      </Section>

      <Section id="buttons" title="Button">
        <Specimen label="variant × size">
          <div className="space-y-4">
            {(["primary", "secondary", "ghost", "danger"] as const).map(
              (variant) => (
                <div key={variant} className="flex flex-wrap items-center gap-3">
                  <span className="w-20 font-mono text-xs text-ink-subtle">
                    {variant}
                  </span>
                  <Button variant={variant} size="sm">
                    Small
                  </Button>
                  <Button variant={variant}>Browse recipes</Button>
                  <Button variant={variant} size="lg">
                    Sign up free
                  </Button>
                </div>
              ),
            )}
          </div>
        </Specimen>
        <Specimen label="with icon · icon-only · disabled · as link">
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <Plus aria-hidden /> Add to pantry
            </Button>
            <Button variant="secondary" size="icon" aria-label="Save recipe">
              <Bookmark aria-hidden />
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
            <Button asChild variant="ghost">
              <Link href="/kitchen-sink#color">Link styled as button</Link>
            </Button>
          </div>
        </Specimen>
        <Specimen label="on the herb band">
          <div className="on-herb flex flex-wrap gap-3 rounded-xl bg-herb px-6 py-8 text-on-herb">
            <Button variant="inverse" size="lg">
              Browse recipes
            </Button>
            <Button variant="inverse-outline" size="lg">
              Create an account
            </Button>
          </div>
        </Specimen>
      </Section>

      <Section id="chips" title="Chip">
        <Specimen label="filter pills · text">
          <div className="flex flex-wrap gap-1.5">
            <Chip selected>Vegetarian</Chip>
            <Chip>Vegan</Chip>
            <Chip>Gluten-free</Chip>
            <Chip>Dairy-free</Chip>
            <Chip>One-pot</Chip>
          </div>
        </Specimen>
        <Specimen label="filter pills · mono (measurements)">
          <div className="flex flex-wrap gap-1.5">
            <Chip tone="mono">&lt; 20 min</Chip>
            <Chip tone="mono" selected>
              &lt; 30 min
            </Chip>
            <Chip tone="mono">&lt; 45 min</Chip>
            <Chip tone="mono">any</Chip>
            <Chip tone="mono">1–2</Chip>
            <Chip tone="mono">3–4</Chip>
          </div>
        </Specimen>
        <Specimen label="as a link (URL-param filters) · static tag">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip asChild selected>
              <Link href="/kitchen-sink?diet=vegan#chips">Link, selected</Link>
            </Chip>
            <Chip asChild>
              <Link href="/kitchen-sink#chips">Link</Link>
            </Chip>
            <Chip isStatic>Static tag</Chip>
            <Chip isStatic selected>
              Static, selected
            </Chip>
            <Chip disabled>Disabled</Chip>
          </div>
        </Specimen>
      </Section>

      <Section id="fields" title="Input, Select, Textarea">
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <div>
            <Label htmlFor="ks-title">Title</Label>
            <Input id="ks-title" defaultValue="Chana Masala" />
          </div>
          <div>
            <Label htmlFor="ks-search">Search</Label>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-stone"
              />
              <Input
                id="ks-search"
                type="search"
                placeholder="Search recipes or ingredients"
                className="pl-10"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="ks-time">Total time (min)</Label>
            <Input id="ks-time" mono inputMode="numeric" defaultValue="35" />
          </div>
          <div>
            <Label htmlFor="ks-cuisine">Cuisine</Label>
            <Select id="ks-cuisine" defaultValue="indian">
              <option value="indian">Indian</option>
              <option value="italian">Italian</option>
              <option value="korean">Korean</option>
              <option value="mexican">Mexican</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="ks-email">Email</Label>
            <Input
              id="ks-email"
              type="email"
              defaultValue="you@example"
              aria-invalid="true"
              aria-describedby="ks-email-err"
            />
            <FieldHint id="ks-email-err" error>
              That email is missing a domain, like .com.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="ks-disabled">Disabled</Label>
            <Input id="ks-disabled" disabled defaultValue="Can't edit this" />
            <FieldHint>Helper text sits under the field.</FieldHint>
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ks-step">Step 1</Label>
            <Textarea
              id="ks-step"
              defaultValue="Soften onion in oil over medium heat, 6–7 min."
            />
          </div>
        </div>
      </Section>

      <Section id="spice" title="SpiceDots">
        <ul className="flex flex-wrap gap-x-10 gap-y-4">
          {[0, 1, 2, 3, 4].map((n) => (
            <li key={n} className="flex items-center gap-3">
              <SpiceDots level={n} size="md" />
              <span className="font-mono text-xs text-ink-subtle">{n}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="meta" title="MetaRow">
        <Specimen label="full strip">
          <MetaRow time={35} servings={4} calories={410} spice={3} cost={1.9} />
        </Specimen>
        <Specimen label="size md · partial">
          <div className="space-y-3">
            <MetaRow size="md" time={20} servings={2} calories={540} cost={4.2} />
            <MetaRow size="md" time={45} spice={0} />
          </div>
        </Specimen>
      </Section>

      <Section id="card" title="Card">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              cuisine: "Indian",
              title: "Chana Masala",
              time: 35,
              srv: 4,
              cal: 410,
              spice: 3,
              cost: 1.9,
              allergens: null,
            },
            {
              cuisine: "Italian",
              title: "Cacio e Pepe",
              time: 20,
              srv: 2,
              cal: 620,
              spice: 1,
              cost: 2.4,
              allergens: "dairy, wheat",
            },
            {
              cuisine: "Middle Eastern",
              title: "Shakshuka",
              time: 30,
              srv: 3,
              cal: 330,
              spice: 2,
              cost: 2.1,
              allergens: "egg",
            },
          ].map((r) => (
            <Card key={r.title} interactive>
              <CardMedia className="flex items-end p-2.5">
                <span className="rounded-xs bg-canvas px-1.5 py-0.5 font-mono text-[0.5625rem] text-ink-subtle">
                  photo · {r.title.toLowerCase()}
                </span>
              </CardMedia>
              <CardBody>
                <p className="label-mono mb-1.5 tracking-[0.08em]">
                  {r.cuisine}
                </p>
                <CardTitle className="mb-3">
                  <Link
                    href="/kitchen-sink#card"
                    className="rounded-xs after:absolute after:inset-0 focus-visible:outline-offset-4"
                  >
                    {r.title}
                  </Link>
                </CardTitle>
                <MetaRow
                  className="border-t border-line pt-3"
                  time={r.time}
                  servings={r.srv}
                  calories={r.cal}
                  spice={r.spice}
                  cost={r.cost}
                />
                {r.allergens && (
                  <p className="mt-2.5 flex items-center gap-1.5 text-[0.6875rem] text-paprika-deep">
                    <span aria-hidden className="size-1.5 rounded-full bg-paprika" />
                    contains {r.allergens}
                  </p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
