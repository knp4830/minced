# src/components

Grouped by area: `ui` (primitives), `shell` (header, footer, progress), `recipe` (cards, filters, scaler), `pantry` (fridge picker and list), `shopping`, `account`, `admin`, `landing`.

- Server Components by default; add `"use client"` only for state, effects or browser APIs, as low in the tree as possible.
- Named exports only. Colours come from CSS variables in `src/app/globals.css`, never raw hex.
- Filter, search and fridge state live in URL search params.

Per-folder contents: `docs/ARCHITECTURE.md` section 4.
