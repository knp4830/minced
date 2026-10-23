"use client";

import { ErrorView } from "@/components/shell/errorView";

/* Catches anything the route-group boundaries do not: a failing group layout (for example the site header
   or the admin check) and the @modal slot. It renders inside the root layout, which has no header, so it
   brings the wordmark. If the root layout itself fails, global-error.tsx takes over. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="flex-1">
      <ErrorView error={error} reset={reset} brand />
    </main>
  );
}
