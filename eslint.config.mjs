import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Not application code: the design mockup runtime and repo shell scripts.
      "design/**",
      "scripts/**",
      // Agent worktrees and local snapshots: other checkouts, not this one.
      ".claude/**",
      ".snapshot/**",
    ],
  },
];

export default eslintConfig;
