export default function Loading() {
  // The form is not a grid of recipes, so do not inherit the /recipes skeleton.
  return <div aria-busy="true" className="mx-auto min-h-[60vh] w-full max-w-3xl px-(--gutter) py-10" />;
}
