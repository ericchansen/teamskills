# Keaton — History

## Project Context
- **Project:** Team Skills Tracker — React + Vite frontend, Express backend, PostgreSQL, Azure Container Apps
- **User:** Eric Hansen
- **Current Focus:** Fix CI/CD staging deployment and authentication setup
- **Auth:** Microsoft Entra ID via MSAL browser (frontend) + JWT bearer validation (backend)
- **IaC:** Azure Bicep in `infra/`, deployed via `azd`
- **CI/CD:** GitHub Actions (`ci-cd.yml`, `pr-staging.yml`, `pr-cleanup.yml`)
- **Key files:** `infra/main.bicep`, `infra/core/`, `infra/app/`, `.github/workflows/`

## Learnings

### 2026-03-01 — PR #24–#28 Strategic Review

**Arc:** PRs #25→#27→#28 form a clean stabilization arc: fix broken infra → harden auth → polish CI/CD. PR #24 was wisely closed (stable staging conflicted with per-PR isolation). PR #26 routine Dependabot.

**What's working well:**
- azd adoption for production deploy is the right call — single tool for provision + deploy
- Round Table (3-model AI consensus) review process producing real findings (PR #27 multi-tenant JWKS, cache reduction)
- Hardcoded URLs, dead config, and unnecessary Graph API permissions are being actively retired
- Production auth enforcement decision (503 on misconfigured prod) is solid
- Dependabot skip for staging deploy saves real Azure costs

**Architecture concerns flagged:**
1. **Staging ≠ Production parity**: Production uses `azd`, staging uses raw `azure/arm-deploy`. Different deploy paths = different failure modes. Should converge.
2. **Hardcoded ACR name** in `pr-staging.yml` (`crgvojq4dgzbtk4`) couples staging to current prod. If prod reprovisioned, staging breaks silently.
3. **Demo user in backend auth** (PR #28): `req.user = {id:1, ...}` added to both `requireAuth` and `optionalAuth` when auth not configured. Production guarded by NODE_ENV check, staging Bicep now sets `NODE_ENV=staging` — so staging gets demo mode if auth env vars missing. Frontend has localhost gate per team decision, but backend has no equivalent hostname check.
4. **No E2E in CI**: Pipeline runs lint + unit tests only. Smoke test validates config injection but not actual user flows.

**What should come next:**
- Merge PR #28 (fixes are correct, the env name mismatch is critical)
- Converge staging deploy to use azd (eliminate the two-path problem)
- Add E2E test stage or at minimum health-check integration tests
- Consider extracting ACR name to GitHub vars instead of hardcoding

### 2026-03-02 — Production Diagnostics (Live Site Investigation)

**Issue investigated:** "Loading profile" hangs + SharePoint sync status

**Root cause confirmed: PostgreSQL auto-pause + missing connection timeout**

The Azure PostgreSQL Flexible Server (`psql-gvojq4dgzbtk4`) auto-pauses when idle to save costs. When a user hits the site:
1. MSAL login succeeds (no DB needed) 
2. Frontend calls `/api/auth/me` and `/api/users`
3. `requireAuth` middleware calls `findOrCreateUser()` → queries PostgreSQL
4. `db.js` Pool has **no `connectionTimeoutMillis`** → waits indefinitely for TCP connection
5. OS TCP timeout fires after ~2 minutes → `connect ETIMEDOUT 20.29.99.102:5432`
6. User sees "Loading your profile..." for 1-2+ minutes

**Fix required in `backend/db.js`:** Add `connectionTimeoutMillis: 5000` and `statement_timeout` to the Pool config. Without these, every request hangs until OS-level TCP timeout when DB is paused.

**Wake function exists but unclear if deployed:** `wake-function/` has an Azure Function to start the DB, but it's not visibly integrated into the frontend flow. The frontend should call the wake endpoint before or alongside API requests when the backend times out.

**SharePoint sync status:** Code exists in `backend/services/sharepoint.js` but the admin endpoint returns **501 Not Implemented** for SharePoint source — Graph API client not configured. The production data IS real (real team members: Almir Banjanovic, Brandon Babcock, Carl Solazzo, Eric Hansen, etc.) — it was loaded via CSV import from the SharePoint list, not live API sync.

**Infrastructure confirmed working:**
- Resource group: `rg-teamskills-prod` (not `rg-teamskills`)
- Backend: `ca-backend-gvojq4dgzbtk4` — Running
- Frontend: `ca-frontend-teamskills` — Running
- PostgreSQL: `psql-gvojq4dgzbtk4` — was Stopped, manually started
- Backend API URL: `https://ca-backend-gvojq4dgzbtk4.greenwater-c5983efd.centralus.azurecontainerapps.io`
- Auth config endpoint (`/api/auth/config`) works (excluded from Easy Auth)
- Backend health endpoint returns 401 (Easy Auth blocks unauthenticated access)

### 2026-07-15 — SharePoint Sync Path Analysis

**Question:** How to pull data from the SharePoint list "Skills Matrix MVP" at `microsoft.sharepoint.com/teams/SDPAccountsShared`.

**Key findings:**

1. **All Graph API / SharePoint REST API paths are blocked.** `Sites.Read.All` (delegated) requires admin consent (reclassified as high-impact July 2025). We cannot obtain admin consent in the Microsoft corp tenant (72f988bf). This blocks: client credentials, delegated auth, OBO flow, SharePoint REST API, and new app registrations in our tenant.

2. **The existing `SHAREPOINT_CLIENT_ID` / `SHAREPOINT_CLIENT_SECRET` env vars in `admin.js` line 632-633 are dead code.** They imply a client credentials flow that is permanently blocked by tenant constraints. Should be removed.

3. **`@microsoft/microsoft-graph-client` is a root-level dependency** (package.json) but is NOT in `backend/package.json`. The `fetchFromSharePoint()` function expects a pre-built Graph client but nobody constructs one.

4. **Recommended path: Power Automate sync bridge.** Eric creates a flow using the SharePoint connector (runs under his identity, no admin consent needed) that reads the list and POSTs records to a new `/api/admin/sync-skills` variant accepting `source: 'api'` with a direct `records` JSON array. Zero cross-tenant issues.

5. **Quick test available:** Eric can try `acquireTokenSilent({ scopes: ['Sites.Read.All'] })` in the browser console. If it succeeds (someone already granted consent for app 69c41897), delegated auth via MSAL would work. If it fails, Power Automate is the only viable path.

6. **Auth architecture note:** The app uses MSAL with `PublicClientApplication` (frontend) + JWT validation (backend). Login scopes are `api://{clientId}/access_as_user`. Graph scopes (`User.Read`) are declared in `authConfig.js` but only for user photos — no SharePoint scopes exist.

**Decision written to:** `.squad/decisions/inbox/keaton-sharepoint-sync-path.md`
