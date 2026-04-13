# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server on localhost:5173 (strictPort — won't fall back to 5174)
npm run build     # tsc -b && vite build → dist/
npm run lint      # ESLint check
npx tsc --noEmit  # Type-check only (no tests exist in this project)
```

No test suite is configured. Type-checking with `npx tsc --noEmit` is the primary correctness check.

## Architecture

**Fully client-side app** — no backend, no network requests. All data lives in an in-browser SQLite database via `sql.js` (WASM), persisted in IndexedDB.

### Router

Uses `HashRouter` (required for Tauri/file:// compatibility). Routes are defined in `src/App.tsx`. The base Vite path is `./` so built assets use relative paths.

### Database layer (`src/lib/db.ts`)

- `initDB()` — async, called once at app startup. Loads DB from IndexedDB or creates fresh. Runs all `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE` migrations inline (try/catch for already-existing columns).
- `getDB()` — synchronous, returns the in-memory `Database | null`. All pages call this directly for queries.
- `saveDB()` — async, exports the in-memory DB and writes it back to IndexedDB. Must be called after any write operation.
- **Pattern in pages**: `const db = getDB(); if (!db) return; db.exec(...)` — synchronous SQL, results are `{ columns, values }[]`.

### SQLite schema

Tables: `patients`, `appointments`, `clinical_acts`, `import_logs`, `patient_annotations`, `logosw_dictionary`. Key relationships:
- `appointments.patient_id` → `patients.id`
- `clinical_acts.patient_id` → `patients.id`
- Reconciliation is done at query time by joining on `patient_id + date`

### Data import flow (`src/pages/Imports.tsx`)

Three file sources parsed client-side:
1. **Doctolib** (CSV) — appointments & patient identities
2. **LogosW comptabilité** (CSV/XLSX) — clinical acts & settlements
3. **LogosW patients** (CSV/XLSX, optional) — dictionary for patient matching

Import strategy: for each date present in the uploaded files, existing `appointments` and `clinical_acts` rows for those dates are deleted before re-insertion (idempotent by date range). Each import batch gets an `import_id` (format: `IMP-{timestamp}{random}`) for selective rollback.

Parsing uses `papaparse` for CSV and `xlsx` for Excel. Dates from Excel are handled as numeric serial values (constant `25569` offset from Unix epoch, UTC noon anchoring to avoid timezone drift).

### Patient matching system

`src/lib/similarity.ts` — Levenshtein-based similarity with word-level matching (handles name inversions, accents). Used in `Patients.tsx` and `PatientDetail.tsx` to suggest LogosW dossier links for unmatched Doctolib patients.

Matching logic (in `PatientDetail.tsx`): first tries DOB-based lookup in `logosw_dictionary`, then falls back to name similarity (≥85% threshold). Detects DD/MM swapped dates (US vs FR format confusion).

### Practitioner name mapping

LogosW stores practitioner initials (`"RM"`, `"MF"`, etc.). The canonical mapping is hardcoded in multiple pages (Dashboard, Activity, Revenues, PatientDetail) — **not yet centralized**. If adding a new practitioner, update all four files.

### Styling

- **No CSS framework**. Design tokens in `src/index.css` as CSS custom properties (`--primary`, `--success`, `--danger`, etc.).
- Utility classes: `.btn`, `.btn-primary`, `.btn-outline`, `.btn-ghost`, `.card`, `.badge`, `.badge-{success|warning|danger|info}`, `.input`, `.table-container`.
- Inline `style={{}}` props are used alongside these classes throughout. Prefer existing CSS variables over hardcoded colors.
- Animations: Framer Motion (page transitions in `Layout.tsx`, Login animations). Do not remove `AnimatePresence` from Layout.
- Charts: Recharts (`BarChart`, `PieChart`, `ResponsiveContainer`).

### Key utilities

- `src/lib/dateUtils.ts` — `toISODate()` (any format → YYYY-MM-DD, Excel-safe), `formatToFrench()` (→ DD/MM/YYYY), `formatToISO()`. Always use `+ 'T12:00:00'` when constructing `new Date()` from an ISO string to avoid timezone midnight-rollback.
- `src/lib/queries.ts` — legacy helper, largely unused by pages which query SQL directly.

### Tauri notes

`vite.config.ts` has `base: './'` and `strictPort: true` for Tauri compatibility. The `sql-wasm.wasm` file must be in `public/` and is referenced via `/sql-wasm.wasm` at runtime.
