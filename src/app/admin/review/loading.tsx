export default function Loading() {
  return (
    <div className="page-w py-6" role="status" aria-live="polite">
      <span className="sr-only">Loading recipe</span>
      <div className="h-3 w-48 motion-safe:animate-pulse rounded bg-track" />
      <div className="mt-6 h-9 w-2/3 motion-safe:animate-pulse rounded bg-track" />
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="h-72 motion-safe:animate-pulse rounded-xl bg-track" />
        <div className="h-72 motion-safe:animate-pulse rounded-xl bg-track" />
      </div>
    </div>
  );
}
