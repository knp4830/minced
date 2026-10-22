/* The small marks the calendar and the day card share (currentColor, so they follow the token they sit on). */

export function Dumbbell({ dim }: { dim?: boolean }) {
  return (
    <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden className={dim ? "text-ink/25" : "text-herb"} fill="currentColor">
      <rect x="0" y="2" width="2" height="4" rx="0.6" />
      <rect x="2.5" y="0.5" width="2.5" height="7" rx="0.6" />
      <rect x="5" y="3" width="4" height="2" />
      <rect x="9" y="0.5" width="2.5" height="7" rx="0.6" />
      <rect x="12" y="2" width="2" height="4" rx="0.6" />
    </svg>
  );
}

/** Filled = goal hit, ring = partly or just logged. */
export function Plate({ hit, dim }: { hit: boolean; dim?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={dim ? "text-ink/25" : "text-herb"}>
      <circle cx="6" cy="6" r="5.2" fill={hit ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="6" r="2.2" fill={hit ? "var(--color-surface)" : "none"} stroke={hit ? "none" : "currentColor"} strokeWidth="1" />
    </svg>
  );
}

export function ScaleMark({ dim }: { dim?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={dim ? "text-ink/25" : "text-ink-muted"} fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="1.2" y="1.2" width="9.6" height="9.6" rx="2" />
      <path d="M3.6 5.2 A2.4 2.4 0 0 1 8.4 5.2" strokeLinecap="round" />
      <path d="M6 5.2 L6.8 3.8" strokeLinecap="round" />
    </svg>
  );
}

export function Moon({ dim }: { dim?: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className={dim ? "text-ink/25" : "text-ink-muted"} fill="currentColor">
      <path d="M6.5 1.2 A4.6 4.6 0 1 0 10.8 7.4 A3.6 3.6 0 0 1 6.5 1.2 Z" />
    </svg>
  );
}
