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
