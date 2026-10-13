# scripts

Offline tooling. Nothing here is deployed.

`parser/` (Python ingredient parser), `myplate/` (USDA recipe import), `content/` (original recipes), `nutrition/` (USDA FDC), `cookware/`, `photos/`, `perf/`, plus single-file helpers (`db-seed.sh`, `ingredient-coverage.sh`, `parse-and-resolve.sh`, `test-*.mts`).

- Python on Windows: open files with `encoding='utf-8'` and write with `newline='\n'`.
- Generated SQL (`seed-cookware.sql`, `seed-photos.sql`) is rebuilt from the sources in the matching folder; edit the sources.
- Never write the live database from a script during a wave; use the snapshot (`.snapshot/restore.sh`).

Pipeline overview: `docs/ARCHITECTURE.md` section 6. Mistakes to avoid: `docs/LESSONS.md`.
