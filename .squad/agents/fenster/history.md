# Fenster — History

## Project Context
- **Project:** Team Skills Tracker — Express + Node.js backend, PostgreSQL
- **User:** Eric Hansen
- **Auth:** JWT bearer validation via `jwks-rsa`, optional (demo mode if not configured)
- **Admin init:** POST /api/admin/init requires INIT_SECRET env var and matching `secret` in body
- **Key files:** `backend/`, `backend/routes/`, `backend/middleware/`, `database/`
- **Docker:** Port 5432 for postgres; use docker-compose.override.yml to remap to 5434:5432 (avoid conflicts)

## Learnings
- `requireAuth` in production now returns 503 if Entra ID env vars are missing (no more unauthenticated demo mode in prod). Demo mode still works in dev/test.
- `/health` and `/api/auth/*` are exempt from `requireAuth` by middleware ordering in `server.js` — `/health` is not under `/api`, and `authRouter` is mounted before the `requireAuth` middleware.
- `requireOwnership` and `requireAdmin` also have `isAuthConfigured()` pass-through — if production enforcement is needed there too, same pattern applies.
- PR #28 added `req.user = { id: 1, ... is_admin: true }` in demo mode for both `requireAuth` and `optionalAuth`. Hardcoded `id: 1` assumes that user ID exists in the DB — fragile but functional for dev.
- PR #27 moved JWKS to `common` endpoint (multi-tenant), dropped issuer validation (correct for multi-tenant), reduced cache to 4h, simplified `isAuthConfigured()` to only need `AZURE_AD_CLIENT_ID`. All sound changes.
- `POST /api/categories` now requires `requireAuth + requireAdmin` (fixed). GET /categories remains public.
- `/admin/status` now requires `requireAuth + requireAdmin` (fixed). Error handler uses generic message instead of leaking `error.message`.
- `GET /api/users` and `GET /api/users/:id` now use explicit column list excluding `entra_oid` (fixed).
- ESLint config uses `argsIgnorePattern: '^_'` but this only covers function args, not catch clause variables. Use bare `catch {}` (no binding) when the error object isn't needed.
- **CRITICAL:** `process.exit(-1)` in `db.js` pool error handler was killing the entire backend on transient Azure PostgreSQL auto-pause errors. Fixed to log only. Azure PostgreSQL Flexible Server auto-pauses to save costs — transient connection errors during wake-up are EXPECTED.
- `/health` endpoint now verifies actual DB connectivity (returns 503 if DB unreachable). The previous implementation always returned 200, even when DB was down — Azure Container Apps liveness probes need truthful health checks.
- Added SIGTERM handler to `server.js` for graceful shutdown. When ACA scales down or redeploys, SIGTERM allows in-flight requests to complete before killing the container. Without this, users see "loading profile" hang.
- SharePoint sync (`backend/services/sharepoint.js`) is fully implemented but NOT wired to any cron/scheduler. The `/api/admin/sync-skills` endpoint exists and requires `INIT_SECRET`, but must be triggered manually (e.g., via cURL or scheduled job). Production has NO automated sync — all skills come from the initial seed data in `/api/admin/init`.
- `POST /api/admin/sync-skills` now accepts optional `csvContent` in the request body. When provided, the raw CSV text is parsed directly via `parseCSVContent()` instead of reading from disk. This avoids needing the CSV file deployed alongside the app. The file-based fallback still works when `csvContent` is omitted.
- `cloud-solutions-engineer-skills.csv` is in `.gitignore` — it contains real team member PII and must never be committed. The file stays on disk for local dev but won't be tracked.
- The real SharePoint skills matrix export (`.data/skills-matrix.csv`) is a **pivot-table format** — rows are users, columns are skills, values are proficiency levels (100/200/300/400). Completely different from the columnar CSV the original sync expected.
- `parsePivotCSV()` and `syncPivotToDatabase()` handle this format. Use `source: 'pivot-csv'` with the admin sync endpoint. Supports both `csvContent` (inline) and `filePath` (disk).
- `proficiency_level` in the DB is VARCHAR(10) with CHECK constraint: must be 'L100', 'L200', 'L300', or 'L400'. The pivot CSV stores raw numbers (100-400) — mapping is `L${value}`.
- Users table requires `email` NOT NULL UNIQUE, but the pivot CSV has no email column. The importer generates placeholder emails (`firstname.lastname@placeholder.local`). When Entra ID integration is live, these should be updated with real emails via the auth flow.
- `.data/` directory is in `.gitignore` — it holds the real pivot CSV with PII. Never commit.
