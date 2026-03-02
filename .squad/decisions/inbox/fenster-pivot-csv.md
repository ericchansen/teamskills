# Decision: Pivot-Table CSV Importer for SharePoint Skills Matrix

**Author:** Fenster (Backend Dev)
**Date:** 2025-07-15
**Status:** Implemented

## Context
The real SharePoint skills matrix export is a pivot table — rows are users, columns are 146 skills, values are proficiency levels (100-400). The existing sync code expected a columnar format (one row per skill with Role/Category/Product columns). A new parser was needed.

## Decision
Added `parsePivotCSV()` and `syncPivotToDatabase()` to `backend/services/sharepoint.js`. The admin sync endpoint now accepts `source: 'pivot-csv'` alongside the existing `csv` and `sharepoint` sources.

## Key Design Choices

1. **Proficiency mapping:** CSV stores `100`/`200`/`300`/`400` → DB stores `L100`/`L200`/`L300`/`L400` (VARCHAR CHECK constraint). Simple string prefix.

2. **Email generation:** Users table requires `email NOT NULL UNIQUE` but pivot CSV has no email. Generated as `firstname.lastname@placeholder.local`. These get overwritten when users authenticate via Entra ID.

3. **Team mapping:** CSV `Qualifier` column (e.g., "Apps & AI", "Data", "Infra") maps to `users.team`. Not `role` — the qualifier describes the team area, not job title.

4. **Skill upsert by name:** Skills are matched by exact name. The CSV headers become skill names. No category assignment from the pivot CSV (the columnar CSV handled categories via the `Role` column).

5. **File path support:** Added `filePath` option to the sync endpoint for local dev convenience. The `.data/` directory is gitignored and holds the real CSV.

## Risks
- Placeholder emails are fragile — if Entra ID auth is enabled before users log in, they won't match. The auth flow should update email on first login.
- Skill names from the pivot CSV may not exactly match seed data names (e.g., "Azure Functions3" appears to be a duplicate column with a typo in the SharePoint export).
- No category assignment for new skills created from pivot columns — they get `category_id = NULL`.

## Commit
`8ab99bd` on `fix/prod-profile-loading`
