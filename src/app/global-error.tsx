"use client";

/* Last resort when the root layout itself fails. Plain styles: nothing else may be loaded. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "4rem 1rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem" }}>Something went wrong</h1>
        <p>We couldn&apos;t load Minced. Try again in a moment.</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ minHeight: 44, padding: "0 1.25rem", fontSize: "1rem", cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
