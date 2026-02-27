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
