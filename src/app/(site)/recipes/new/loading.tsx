import { FormSkeleton } from "@/components/shell/pageSkeletons";

// The form is not a grid of recipes, so it does not inherit the /recipes skeleton.
export default function Loading() {
  return <FormSkeleton />;
}
