# supabase

- `migrations/`: append-only. Never edit an applied file. Apply to live BEFORE merging code that needs it. Must run as a non-superuser (no `SET pg_trgm.*` before a pg_trgm function has been called in the same migration).
- `seed-*.sql`: idempotent data files. Some are generated (`seed-cookware.sql`, `seed-photos.sql`); change their sources in `scripts/`, not the output.
- `tests/`: SQL and shell regression suites. `.sh` files need a local stack and must never be pointed at live.
- `config.toml`: local-stack settings only. Do not `supabase config push` it: it has weaker auth settings than live.

Which migration currently defines each function: `docs/ARCHITECTURE.md` section 5. Mistakes to avoid: `docs/LESSONS.md`.
