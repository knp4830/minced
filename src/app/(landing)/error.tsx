"use client";

import { ErrorView } from "@/components/shell/errorView";

/* The landing page failed. Its layout has no header (the nav lives inside the page that just broke),
   so the error screen brings the wordmark. The dark footer from the layout stays. */
export default function LandingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} brand />;
}
