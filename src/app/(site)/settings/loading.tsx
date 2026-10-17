/* Section skeletons while Settings loads. No text spinner. */
export default function Loading() {
  return (
    <div className="page-w py-6 md:py-10" aria-busy="true">
      <div className="max-w-xl">
        <div className="mb-8 h-9 w-40 rounded-md bg-sunken" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="border-t border-line py-7 first:border-t-0 first:pt-0">
            <div className="h-3 w-24 rounded bg-sunken" />
            <div className="mt-3 h-6 w-48 rounded bg-sunken" />
            <div className="mt-5 flex gap-2">
              <div className="h-11 w-28 rounded-sheet bg-sunken" />
              <div className="h-11 w-28 rounded-sheet bg-sunken" />
              <div className="h-11 w-28 rounded-sheet bg-sunken" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
