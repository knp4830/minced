import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Minced, home"
      className={cn(
        "-mx-1 inline-flex min-h-11 items-center rounded-md px-1 font-display text-[1.3125rem] leading-none font-semibold tracking-[-0.02em] text-ink",
        className,
      )}
    >
      Minced
    </Link>
  );
}
