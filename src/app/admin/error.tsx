"use client";

import { ErrorView } from "@/components/shell/errorView";

/* An admin page failed; the admin bar from the layout stays so you can still move around. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} />;
}
