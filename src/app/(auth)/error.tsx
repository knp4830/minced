"use client";

import { ErrorView } from "@/components/shell/errorView";

/* A log in / sign up page failed. The (auth) layout already draws the wordmark above the card. */
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
