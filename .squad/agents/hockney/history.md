# Hockney — History

## Project Context
- **Project:** Team Skills Tracker — Playwright E2E + Jest unit tests
- **User:** Eric Hansen
- **E2E:** Playwright with project name "msedge" (Edge browser, NOT Chrome)
- **Unit tests:** Jest (`jest.config.js` at root)
- **Test config:** `playwright.config.js` at root, `tests/` directory
- **Key commands:** `npx playwright test --project="msedge"`, `npm test`, `npm run lint`

## Learnings

### 2026-02-27 — Production auth enforcement tests
- Added 7 new tests to `backend/tests/auth.test.js` covering `requireAuth` and `isAuthConfigured`
- Key scenarios: production 503 when auth unconfigured, demo pass-through for non-prod, 401 when configured but no token
- Backend tests: 9 suites, 67 tests all pass (was 60 before)
- Frontend unit tests: 3 suites, 24 tests all pass
- E2E tests: 13 tests all pass on msedge project
- **Note:** E2E requires `VITE_API_URL=http://localhost:3001` when running frontend via `npx vite` (default proxy targets Docker hostname `backend:3001`)
- **Note:** Frontend container (`teamskills-frontend`) has pre-existing exit code 127 issue; use local vite dev server + `BASE_URL` env var as workaround
- **Note:** Agent container has pre-existing `ImportError` for `ChatAgent`; does not affect E2E tests

### 2026-03-01 — PR review health check (PRs #25–#28)
- Ran full test suite on branch `chore/fix-cicd-pipeline` (PR #28)
- **Backend unit tests:** 9 suites, 67 tests — ALL PASS (unchanged from PR #27 baseline)
- **Frontend unit tests:** 3 suites, 24 tests — ALL PASS
- **Lint:** Clean, zero errors
- **E2E tests:** 13 tests — ALL PASS (via local vite server workaround)
- **E2E Docker issue persists:** Docker frontend bakes `VITE_API_URL=http://backend:3001` into `config.js`; browser on host can't resolve Docker hostname. Must use local vite dev server with `VITE_API_URL=http://localhost:3001` and `BASE_URL=http://localhost:5173`.
- **PR #28 auth change:** `requireAuth` and `optionalAuth` now inject `req.user = { id: 1, name: 'Demo User', ... }` in demo mode — NO unit tests cover this new behavior yet
- **PR #28 staging Bicep change:** `NODE_ENV` changed from `production` to `staging` for staging container apps — aligns with auth enforcement decision (503 only in production)
- **Test gaps identified:**
  1. No tests verify `req.user` is populated with demo user object in demo mode (`requireAuth`)
  2. No tests for `optionalAuth` demo user injection at all (new code in PR #28)
  3. No tests for `optionalAuth` with valid/invalid tokens when auth IS configured
  4. E2E Docker config issue needs a permanent fix (nginx proxy or docker-compose.override)

### 2026-03-01 — Added 4 missing auth middleware tests (PR #28)
- Added `jest.mock('jsonwebtoken')` to enable token verification testing without real JWKS
- **Test 1:** `requireAuth` demo mode populates `req.user` with `{ id: 1, name: 'Demo User', email: 'demo@example.com', is_admin: true }`
- **Test 2:** `optionalAuth` demo mode populates `req.user` with same demo user shape
- **Test 3:** `optionalAuth` with valid Bearer token resolves user via `jwt.verify` → `findOrCreateUser` and sets `req.user` + `req.claims`
- **Test 4:** `optionalAuth` without token sets `req.user = null` and still calls `next()` (no rejection)
- **Results:** 9 suites, 71 tests all pass (was 67). Lint clean.
- **Pattern:** Used `jwt.verify.mockImplementation((token, keyFunc, options, callback) => callback(null, mockClaims))` to simulate successful token verification without hitting JWKS endpoint

### 2026-03-01 — Security hardening tests for Fenster's auth changes
- Added 7 new tests across 3 files covering auth enforcement, response filtering, and error handling
- **categories.test.js (+2):** POST /api/categories returns 401 when auth configured but no token; succeeds in demo mode (demo user is admin)
- **admin.test.js (+3):** GET /api/admin/status returns 401 when auth configured but no token; succeeds in demo mode; error handler returns generic `'Database connection failed'` message (not raw `error.message`)
- **users.test.js (+2):** GET /api/users and GET /api/users/:id SQL queries exclude `entra_oid` and don't use `SELECT *`
- **Results:** 9 suites, 74 backend tests all pass. 3 suites, 24 frontend tests all pass. Lint clean.
- **Pattern:** For route-level auth tests, set `AZURE_AD_CLIENT_ID`/`AZURE_AD_TENANT_ID` env vars before request and clean up in `afterEach`. The global `requireAuth` on `/api` rejects before route-level middleware for categories; admin routes have their own per-route auth since adminRouter is mounted before the global middleware.
- **Note:** POST /api/categories goes through BOTH global `requireAuth` (on `/api`) AND route-level `requireAuth, requireAdmin`. GET /api/admin/status only goes through route-level auth since adminRouter is mounted before the global middleware.

### 2025-07-24 — E2E test run and flaky test fix
- Ran full E2E suite (13 tests, msedge project): 12 passed, 1 flaky on first run
- **Flaky test:** `should change proficiency level for existing skill` in `userProfile.spec.js`
- **Root cause:** Test used `page.waitForTimeout(1000)` instead of waiting for the API response after changing proficiency. Race condition: component re-renders from API response before assertion, resetting the dropdown value.
- **Fix:** Replaced `waitForTimeout` with `page.waitForResponse(resp => resp.url().includes('/api/user-skills') && resp.status() < 400)` — same pattern used in `workflows.spec.js`
- **After fix:** All 13 tests pass cleanly in 42s, no flaky tests
- **Pattern:** Always wait for API responses after user actions that trigger server calls, never use `waitForTimeout` as a substitute
