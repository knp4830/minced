import Link from "next/link";
import { Button } from "@/components/ui/button";

// Placeholder home. The real landing page is its own milestone.
export default function Home() {
  return (
    <div className="mx-auto max-w-[1180px] px-(--gutter) py-16 md:py-24">
      <h1 className="max-w-[14ch] text-[2.5rem] leading-[1.02] tracking-[-0.025em] md:text-[3.5rem]">
        Find the recipe. Skip the life story.
      </h1>
      <p className="mt-5 max-w-[30em] text-[1.0625rem] leading-relaxed text-ink-soft">
        Tell Minced what&apos;s in your kitchen and it shows you what you can
        make. Ingredients, amounts, steps — no essay.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link href="/recipes">Browse recipes</Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/kitchen-sink">Design kitchen sink</Link>
        </Button>
      </div>
    </div>
  );
}
