# src/lib/queries

Every database call lives here. Components and pages never call `supabase.from()` or `.rpc()` directly.

- Public catalog reads use the cookie-free client (`lib/supabase/static.ts`) so they can sit inside `unstable_cache`.
- Per-user reads (`fridge`, `shopping`, `favorites`, `userCookware`, `account`) use the cookie client and rely on RLS.
- Ranking and filtering are Postgres functions called by RPC (`matcher.ts`, `search.ts`); never fetch all recipes and filter in JavaScript.

One-line description of each file: `docs/ARCHITECTURE.md` section 3. Read `docs/LESSONS.md` before changing a query or an RPC signature.
