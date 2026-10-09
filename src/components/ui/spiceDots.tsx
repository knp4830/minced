import { cn } from "@/lib/utils";

const MAX = 4;
const LABELS = ["Not spicy", "Mild", "Medium", "Hot", "Very hot"] as const;

export interface SpiceDotsProps {
  /** 0 (not spicy) to 4 (very hot). Out-of-range values are clamped. */
  level: number;
  size?: "sm" | "md";
  className?: string;
}

/** The 4-dot heat indicator: filled paprika dots, hollow stone dots for the rest. */
export function SpiceDots({ level, size = "sm", className }: SpiceDotsProps) {
  const n = Math.min(MAX, Math.max(0, Math.round(level)));
  const dot = size === "sm" ? "size-[7px]" : "size-2";
  return (
    <span
      role="img"
      aria-label={`Spice: ${LABELS[n]} (${n} of ${MAX})`}
      className={cn("inline-flex items-center gap-[3px]", className)}
    >
      {Array.from({ length: MAX }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "rounded-full",
            dot,
            i < n
              ? "bg-paprika"
              : "border border-stone-line bg-transparent",
          )}
        />
      ))}
    </span>
  );
}
