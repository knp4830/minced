// Module resolve hook for scripts/test-me.mts: lets Node (strip-types) load src/lib files that import
// "@/lib/..." (the tsconfig path alias) without a bundler and without changing tsconfig.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const p = path.join(root, "src", specifier.slice(2));
    return nextResolve(pathToFileURL(/\.[cm]?[jt]sx?$/.test(p) ? p : `${p}.ts`).href, context);
  }
  return nextResolve(specifier, context);
}
