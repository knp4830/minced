import { FormSkeleton } from "@/components/shell/pageSkeletons";

// Without its own file this route would inherit the recipe-page skeleton from [slug]/loading.tsx.
export default function Loading() {
  return <FormSkeleton label="Loading your recipe" />;
}
