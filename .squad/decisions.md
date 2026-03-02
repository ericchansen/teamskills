# Decisions

_Team decisions are recorded here. Append-only._

---

## Production Auth Enforcement

### Enforce Auth in Production Backend

**By:** Fenster (Backend Dev)  
**Date:** 2026-02-27

**Context**  
The `requireAuth` middleware previously allowed unauthenticated access (demo mode) whenever Entra ID env vars were not set — regardless of environment. This created a risk of deploying to production without auth.

**Decision**  
When `NODE_ENV=production` and auth is not configured, `requireAuth` now returns **503 Service Unavailable** instead of passing through. Demo mode is preserved for non-production environments.

**Rationale**
- 503 (not 401/403) signals a server misconfiguration, not a client auth failure
- Health and auth-config endpoints remain accessible for monitoring and client bootstrap
- Minimal change (3 lines) with no refactoring of other middleware

**Impact**
- Backend deployments to production MUST have `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` set
- No impact on local development or test environments

---

### Skip Staging Deploy for Dependabot PRs

**Author:** McManus (DevOps)  
**Date:** 2026-02-27

**Context**  
Dependabot PRs (dependency bumps) trigger the full PR staging deploy pipeline, which provisions Azure Container Apps, PostgreSQL, and ACR image builds. This is expensive and unnecessary for automated dependency updates.

**Decision**  
Added `if: github.actor != 'dependabot[bot]'` to the `deploy-staging` job in `pr-staging.yml`. Dependabot PRs will still trigger lint/test jobs if they are added in the future, but skip the costly infrastructure deployment.

**Consequences**
- Reduced Azure costs from unnecessary staging environments on dependency bumps
- Dependabot PRs won't get staging preview URLs in PR comments
- If staging validation is needed for a dependency change, it can be triggered manually

---

### Gate Demo Login to Localhost Only

**Author:** Verbal (Frontend Dev)  
**Date:** 2026-02-27

**Context**  
The demo user dropdown allowed anyone to impersonate any user without authentication when auth env vars were missing — including on deployed instances.

**Decision**  
Demo mode is now restricted to `localhost` / `127.0.0.1` only. Deployed instances without auth configuration show a "contact your administrator" error. Detection uses `window.location.hostname`.

**Impact**
- **Local dev:** No change — demo dropdown still works.
- **Deployed (no auth):** Users see an error message instead of a user picker. No unauthenticated access.
- **Deployed (with auth):** No change — MSAL login flow as before.

---

### Easy Auth openIdIssuer Must Match Token Version

**Author:** Fenster (Backend Dev)  
**Date:** 2026-02-27

## Context

PR #23 staging deployment had MSAL login succeeding but `/api/auth/me` returning 401. Users saw "Unable to load your profile" after authenticating.

## Root Cause

The Entra ID app registration (`69c41897-2a3c-4956-b78d-56670cdb5750`) has `accessTokenAcceptedVersion: null`, which defaults to **v1.0 access tokens**. V1.0 tokens have issuer `https://sts.windows.net/{tenant}/`, but Easy Auth was configured with a v2.0 `openIdIssuer` (`https://login.microsoftonline.com/{tenant}/v2.0`). The issuer mismatch caused Easy Auth to reject valid tokens before they reached Express.

## Decision

1. Changed Easy Auth `openIdIssuer` in `infra/staging/main.bicep` to the v1.0 format: `https://sts.windows.net/{tenant}/`
2. Added `/api/auth/config` to Easy Auth `excludedPaths` (public endpoint needed pre-login)
3. Separated auth errors from DB errors in Express `requireAuth` (401 vs 500)

## Consequences

- Staging auth flow should now work end-to-end with v1.0 tokens
- If the app registration is later updated to `accessTokenAcceptedVersion: 2`, the Easy Auth `openIdIssuer` must be changed back to the v2.0 format
- Any production Bicep must use the same v1.0 issuer pattern
- Express middleware (`auth.js`) already handles both v1 and v2 issuers — no Express changes needed for token version

---

### CI/CD Rewrite: Azure Developer CLI (azd)

**Author:** McManus (DevOps)  
**Date:** 2026-02-27

## Context

The production CI/CD pipeline (`.github/workflows/ci-cd.yml`) used `azure/container-apps-deploy-action@v1` to deploy the application. This action **only updates container images** — it NEVER deploys Bicep infrastructure changes.

### Problem
Every deployment suffered from stale infrastructure configuration:
- Environment variables (VITE_AZURE_AD_CLIENT_ID, VITE_AZURE_AD_TENANT_ID) were never updated from Bicep
- Easy Auth settings were never applied
- Backend auth configuration remained stale
- Manual Bicep deployments were required to fix auth failures

### Root Cause
The `container-apps-deploy-action` is an image-only deployment tool. It pushes new container images to existing Container Apps but ignores all Bicep templates. Infrastructure changes required separate manual intervention.

## Decision

Rewrote the deploy job to use **Azure Developer CLI (azd)** instead of `container-apps-deploy-action`.

### New Workflow Steps
1. **Setup:** `actions/checkout@v4` + `azure/setup-azd@v2`
2. **Auth:** `azd auth login` using service principal credentials (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
3. **Environment:** `azd env new production` or `azd env select production`
4. **Config:** `azd env set` for all Bicep parameters:
   - AZURE_ENV_NAME=production
   - AZURE_LOCATION=centralus
   - AZURE_SUBSCRIPTION_ID
   - AZURE_AD_CLIENT_ID (app registration for user auth)
   - AZURE_AD_TENANT_ID (auth tenant)
   - AZURE_POSTGRES_PASSWORD
5. **Provision:** `azd provision --no-prompt` — applies Bicep templates, updates all infrastructure config
6. **Deploy:** `azd deploy --no-prompt` — builds Docker images, pushes to ACR, updates Container Apps
7. **Validate:** Smoke test curls `/api/auth/config` and `/config.js` to verify auth config is deployed correctly

### What Changed
- **Removed:** All `container-apps-deploy-action` references
- **Removed:** Manual `docker build` + `docker push` commands
- **Removed:** Dangerous tenant fallback `${{ vars.AZURE_AD_TENANT_ID || vars.AZURE_TENANT_ID || '' }}`
- **Removed:** ACR login step (azd handles authentication)
- **Added:** azd auth and environment setup
- **Added:** Bicep provisioning on every deploy
- **Added:** Smoke test validation step

## Rationale

### Why azd?
1. **Infrastructure-aware:** azd provisions Bicep AND deploys code — unified workflow
2. **Environment variables:** `azd env set` integrates with `main.parameters.json` via `${VAR_NAME}` syntax
3. **Consistent with local dev:** Developers use azd locally, CI uses azd — same tool, same behavior
4. **Defined in azure.yaml:** Service definitions (backend, frontend, agent, wake-function) are already declared
5. **No manual steps:** azd handles ACR authentication, image builds, and infrastructure updates automatically

### Why provision on every deploy?
Bicep is idempotent. Running `azd provision` on every deploy ensures:
- Environment variables are always current
- Easy Auth settings match Bicep templates
- Infrastructure drift is eliminated
- No separate "infrastructure update" workflow needed

### Smoke Test Benefits
- **Fast failure:** Detects auth misconfigurations within seconds of deployment
- **Clear signals:** Returns specific error messages (missing clientId, empty tenant, etc.)
- **Prevents cascading issues:** Stops deployment summary from claiming success when auth is broken

## Impact

### Benefits
- **Auth config always deployed:** Bicep infrastructure changes apply automatically on every push to main
- **Reduced manual toil:** No more emergency "run Bicep manually" interventions
- **Faster debugging:** Smoke test catches config errors immediately
- **Single source of truth:** `azure.yaml` + Bicep define the entire system

### Breaking Changes
- None for users — deployment URLs and environment remain the same
- CI workflow structure changed — no functional regression

### Migration Notes
- GitHub secrets/vars unchanged (same credentials, same names)
- First azd deployment will reconcile infrastructure state
- No downtime expected — azd updates in place

## Alternatives Considered

### Keep container-apps-deploy-action + manual Bicep workflow
**Rejected:** Requires developers to remember to run Bicep deployments separately. High risk of human error.

### GitHub Actions + az CLI (no azd)
**Rejected:** Requires scripting Docker builds, ACR pushes, and Container Apps updates manually. azd provides this workflow out-of-the-box.

### Separate provision and deploy jobs
**Rejected:** Adds complexity (job dependencies, artifact passing). Bicep is idempotent, so provisioning on every deploy is safe and simpler.

## Success Criteria

- [x] Deploy job uses azd instead of container-apps-deploy-action
- [x] Bicep provisioning runs on every deployment
- [x] Smoke test validates auth config endpoints
- [x] All environment variables passed via azd env set
- [x] Deployment summary includes azd context
- [x] No references to container-apps-deploy-action remain
- [x] Dangerous tenant fallback removed

---

### Converge Staging Deploy to azd

**Author:** Keaton (Lead/Architect)  
**Date:** 2026-03-01  
**Status:** Proposed

## Context

Production CI/CD (`ci-cd.yml`) uses `azd provision` + `azd deploy` (PR #25).  
Staging CI/CD (`pr-staging.yml`) uses raw `azure/arm-deploy` with inline Bicep in `infra/staging/`.  

This means two entirely different deploy paths, two different failure modes, and staging doesn't validate what production will actually do. The staging Bicep also hardcodes the ACR name (`crgvojq4dgzbtk4`), creating a hidden coupling to current prod infrastructure.

## Decision

Staging should converge to use `azd` with a separate environment name (e.g., `staging-pr{N}` or shared `staging`). This:
- Ensures staging validates the same provision + deploy path as production
- Eliminates the hardcoded ACR name problem (azd discovers resources)
- Reduces maintenance surface (one IaC path, not two)

## Trade-offs

- azd per-PR environments may be slower to provision than raw ARM
- May need `azd` environment lifecycle management in cleanup workflow
- Shared staging (like abandoned PR #24 approach) is simpler but loses per-PR isolation

## Next Steps

- McManus (DevOps) to evaluate azd multi-environment support for PR staging
- Consider whether per-PR isolation is worth the cost vs. shared staging

---

### Auto-manage Entra ID Redirect URIs for PR Staging

**Author:** McManus (DevOps)  
**Date:** 2025-07-24

**Context**  
Each PR staging deploy creates Container Apps with unique URLs. Easy Auth requires `/.auth/login/aad/callback` redirect URIs to be pre-registered on the Entra ID app registration. Without automation, these are missing, causing AADSTS50011 errors when users try to log in to staging environments.

**Decision**  
Added automated steps to both PR workflows:
- `pr-staging.yml`: After infrastructure deploy, registers frontend and backend callback URIs on the Entra ID app (merging with existing URIs to preserve other environments).
- `pr-cleanup.yml`: Before resource deletion, removes URIs matching the PR number pattern.

Both steps are gated on `vars.AZURE_AD_CLIENT_ID` being set, so they skip gracefully when auth is not configured.

**Rationale**
- `az ad app update --web-redirect-uris` replaces all URIs, so the steps must read existing URIs first, merge/filter, then write back.
- Deduplication (`sort -u`) prevents URI accumulation on re-deploys of the same PR.
- Cleanup uses `grep -v "pr${PR_NUMBER}"` to only remove the specific PR's URIs, leaving other staging and production URIs intact.

**Consequences**
- PR staging environments with Easy Auth will work on first deploy without manual Entra ID configuration.
- The service principal used for CI/CD must have `Application.ReadWrite.All` or be an owner of the Entra ID app registration.
- If many PRs are open simultaneously, the app registration will accumulate redirect URIs (cleaned up on PR close).

---

### Remove Easy Auth from Frontend Container Apps

**Author:** McManus (DevOps)
**Date:** 2025-07-24

## Context
The staging deployment had a double-login issue. Easy Auth was configured on both the frontend and backend Container Apps. The frontend Easy Auth (`RedirectToLoginPage`) forced a Microsoft login before the React SPA could load. Once loaded, the React app's MSAL code required a second Microsoft login. Users had to authenticate twice to get in.

The frontend is a SPA serving static files — no sensitive data at the infrastructure level. Authentication should be handled by MSAL in the React app, not by Azure Easy Auth on the container.

## Decision
Remove the `frontendAuth` (`Microsoft.App/containerApps/authConfigs`) resource from:
- `infra/staging/main.bicep` (staging/PR environments)
- `infra/app/frontend.bicep` (production)

Keep the `backendAuth` resource on the backend Container App unchanged — the API must remain protected at the infrastructure level.

## Rationale
- Easy Auth on the frontend is redundant when MSAL handles auth in the SPA
- Double-login is a poor user experience
- The frontend serves static assets (HTML/JS/CSS) — no secrets or sensitive data
- Backend Easy Auth stays to enforce API protection with `Return401` for unauthenticated requests
- Minimal change: only the `frontendAuth` resource blocks are removed

## Consequences
- Users will no longer be prompted to login before the React app loads
- MSAL in the React app remains the single authentication mechanism for users
- Backend API remains protected by Easy Auth (unchanged)
- The `azureAdClientSecret` secret and related params on the frontend container app are now unused but harmless; can be cleaned up in a follow-up

---

### ⛔ CONSTRAINT: Zero Permissions in Microsoft Corp Tenant (72f988bf) — PERMANENT

**Author:** McManus (DevOps) + Eric Hansen  
**Date:** 2026-03-02  
**Status:** Active constraint — PERMANENT  
**Priority:** BLOCKING — affects all Entra ID automation decisions

**The team has ZERO permissions in tenant `72f988bf` (Microsoft corp). Nobody on this team can do anything there — not programmatically, not manually, not via Portal. This is non-negotiable.**

What this rules out:
1. ~~Automated `az ad app update` in CI/CD~~ — SP can't auth to 72f988bf
2. ~~Manual Portal changes to the Entra app~~ — No admin permissions there
3. ~~Tenant-switching login steps~~ — SP is single-tenant
4. ~~Bicep `Microsoft.Graph/applications`~~ — Deploys target wrong tenant
5. ~~Terraform AzureAD provider~~ — Same cross-tenant auth issue
6. ~~Asking Eric to manually add redirect URIs~~ — He doesn't have permissions either

**What we CAN do:**
- Manage Azure resources in tenant `9c74def4` (ACR, Container Apps, PostgreSQL, etc.)
- Create NEW app registrations in tenant `9c74def4`
- Skip auth in staging environments
- Use the existing Entra app for prod (redirect URI already set, URL is stable)

**Viable staging auth options (only 2):**
1. **Skip auth in staging** — deploy without MSAL, test functionality only
2. **New app registration in tenant 9c74def4** — separate Entra app we fully own, Bicep-managed

**Previous decisions invalidated:** "Auto-manage Entra ID Redirect URIs for PR Staging" (above) is BLOCKED and will not work at runtime.

---

### Previous Decision BLOCKED: Auto-Manage Entra ID SPA Redirect URIs

**Author:** Kobayashi (Auth/Security)  
**Date:** 2026-03-02  
**Status:** ⚠️ BLOCKED — See "Zero Permissions in Tenant 72f988bf" above

The implementation in pr-staging.yml and pr-cleanup.yml (adding/removing SPA redirect URIs via `az ad app update`) exists in code but WILL NOT WORK because the CI/CD service principal cannot authenticate to tenant 72f988bf. This code should be removed.

---

### Remove Fictional Seed Users from Init Endpoint

**Author:** Fenster (Backend Dev)  
**Date:** 2026-03-02

## Context

The `/api/admin/init` endpoint seeded 14 fictional demo users (Alex Chen, Jordan Rivera, Morgan Taylor, etc.) and ~130 user_skill assignments into the database. In production, this mixed fake data with the 5 real team members imported via `/api/admin/sync-skills` CSV sync, polluting the skills graph and user list.

## Decision

Removed all `INSERT INTO users` and `INSERT INTO user_skills` statements for fictional users from the init endpoint. The skill categories and skills catalog (the real data) are preserved. Users are now populated exclusively via `/api/admin/sync-skills` with real CSV data.

## Rationale

- Init should set up the schema and skill catalog, not fake user data
- Production had 14 phantom users appearing in the graph alongside real team members
- The CSV sync endpoint already handles user population correctly
- `database/seed.sql` retains demo data for local dev (now labeled LOCAL DEV ONLY)

## Impact

- `/api/admin/init` no longer creates any users or user_skills — only schema + skill catalog
- Production DB must be populated via `/api/admin/sync-skills` after init
- No test impact (all 75 tests pass — none depended on the seed users)
- `database/seed.sql` unchanged except for clarifying header comment

---

### Default Graph to L400-Only with Level Toggles

**Author:** Verbal (Frontend Dev)  
**Date:** 2026-03-02

## Context

The graph view was unreadable — 5 people × 146 skills at all proficiency levels created a dense ball of edges. Users couldn't extract any signal from the visualization.

## Decision

Added a proficiency level filter that defaults to showing **only L400 (expert)** connections. Users can toggle on L300, L200, L100 individually. Skill nodes with no visible connections at the selected levels are hidden entirely — no orphan nodes cluttering the view.

A "Show All / Expert Only" quick toggle provides fast switching between sparse (expert) and full views.

## Rationale

- **Sparse by default:** L400 connections are the most valuable signal (who are the experts?). Starting sparse lets users opt-in to density.
- **Filter at data level:** Links and nodes are filtered before D3 rendering, not via CSS/DOM hiding. This gives D3 a cleaner force simulation with fewer nodes.
- **Minimum one level:** At least one level must remain selected to prevent an empty graph.

## Impact

- Graph loads sparse and readable by default
- Users can progressively reveal more connections
- No backend changes required — filtering is purely client-side

---

### Single Source of Truth for Proficiency Level Colors and Descriptions

**Author:** Verbal (Frontend Dev)
**Date:** 2026-03-02

## Context

Proficiency level colors (L100–L400) were defined independently in three frontend components:

- **ProficiencyBadge.jsx** — Fluent UI palette (red/orange/blue/green)
- **CoverageDashboard.jsx** — Tailwind-like palette (blue/green/yellow/red)
- **TrendsChart.jsx** — Flat UI palette (red/orange/blue/green) — unused

The Experimental view (CoverageDashboard) had completely different L100–L400 colors than the Matrix view (ProficiencyBadge), creating visual inconsistency.

Proficiency level labels ("L100 - Foundational", etc.) were also hardcoded separately in UserProfile.jsx.

## Decision

1. **ProficiencyBadge.jsx is the single source of truth** for proficiency level metadata: colors, labels, and descriptions.
2. Added a `LEVEL_COLORS` export (derived from `PROFICIENCY_CONFIG`) for chart-friendly color lookup.
3. CoverageDashboard now imports `LEVEL_COLORS` from ProficiencyBadge.
4. Removed dead `LEVEL_COLORS` from TrendsChart.
5. UserProfile dropdown now generates options from `PROFICIENCY_CONFIG`.
6. Added a source citation comment referencing the Microsoft L100–L400 taxonomy and CSU Tech Intensity Skill Proficiency Standards.

## Rationale

- One canonical source prevents color/label drift across views.
- The Fluent UI palette from ProficiencyBadge is consistent with Microsoft design standards.
- Descriptions are adapted from the Microsoft standard for a skills-tracker context; exact internal wording is on SharePoint (inaccessible externally).

## Impact

- All views now show consistent L100–L400 colors.
- Future components should import from `ProficiencyBadge` rather than defining their own level colors.

---

### Production Diagnostic Report — 2026-03-02

**Investigator:** Keaton (Lead)  
**Requested by:** Eric Hansen  
**Site:** https://ca-frontend-teamskills.greenwater-c5983efd.centralus.azurecontainerapps.io/

## Executive Summary

The "Loading profile" hang is caused by Azure PostgreSQL auto-pausing combined with missing connection timeouts in the backend's database pool. When the DB is paused, every API request hangs for 1-2 minutes waiting for a TCP connection that will never come. The data is real (from the SharePoint Skills Matrix CSV), but live SharePoint API sync is not yet configured.

## Issue 1: "Loading your profile..." Hangs

### What Users See
1. Site loads → MSAL login redirect → login succeeds
2. "Loading your profile..." spinner appears
3. Hangs for 1-2+ minutes
4. Eventually shows "Unable to load your profile. Please try again." with Retry/Sign out buttons

### Root Cause Chain
1. **Azure PostgreSQL Flexible Server auto-pauses** when idle (cost optimization)
2. Frontend calls `GET /api/auth/me` and `GET /api/users` with Bearer token
3. Backend Easy Auth passes (token valid)
4. Express `requireAuth` middleware validates JWT ✅
5. `findOrCreateUser()` calls `db.query('SELECT * FROM users WHERE entra_oid = $1')` 
6. **`backend/db.js` has NO `connectionTimeoutMillis`** — pg Pool default is `0` (wait forever)
7. TCP connection attempt to `20.29.99.102:5432` hangs until OS-level TCP timeout (~2 min)
8. Eventually: `connect ETIMEDOUT 20.29.99.102:5432`
9. `requireAuth` catch block returns 500: `{ error: 'Failed to load user profile' }`

### Evidence
- Container logs show repeated `lookup error: connect ETIMEDOUT 20.29.99.102:5432`
- PostgreSQL server state was `Stopped` when investigated
- Both `/api/auth/me` and `/api/users` hung with no response in browser network tab
- After manually starting DB (`az postgres flexible-server start`), site loaded within seconds

### Fix Required

**Immediate (backend/db.js):**
```javascript
const pool = new Pool({
  // ... existing config ...
  connectionTimeoutMillis: 5000,    // Fail fast if DB unreachable
  statement_timeout: 10000,         // Kill queries that hang
  query_timeout: 10000,
});
```

**Short-term:** Integrate the existing `wake-function/` — frontend should call the wake endpoint when backend returns 500/timeout, or the backend should call it on pool errors.

**Long-term:** Consider disabling PostgreSQL auto-pause in production, or implement a scheduled ping to keep it alive.

## Issue 2: SharePoint Sync Status

### Finding: Data is REAL, Sync is MANUAL

**The data in production is real team data**, not seed/test data:
- Real team members: Almir Banjanovic, Brandon Babcock, Carl Solazzo, Elan Shudnow, Eric Hansen, Eugene Imbamba, Geraldine Caszo, Heena Ugale
- Real job titles: Sr Solution Engineer, Prin Sol Engineer, Sol Engineer Leader
- Real Azure skills with proficiency levels (L100-L400)

**How it got there:** CSV import from the SharePoint list export, via `/api/admin/sync-skills` with `source: 'csv'`.

**Live SharePoint sync is NOT working:**
- `backend/services/sharepoint.js` has the code to sync via Graph API
- But `/api/admin/sync-skills` with `source: 'sharepoint'` returns **501 Not Implemented**
- Error message: "SharePoint sync not yet configured. Use source: 'csv' or configure SHAREPOINT_CLIENT_ID."
- Required env vars not set: `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_TENANT_ID`

**Note:** The SharePoint list is in tenant `72f988bf` (Microsoft corp). Per team constraint "Zero Permissions in Microsoft Corp Tenant," configuring Graph API access to this SharePoint list may require an app registration that has `Sites.Read.All` delegated permission in that tenant — which we cannot create. CSV export/import may remain the only viable sync path.

## Infrastructure Status

| Resource | Name | Status |
|----------|------|--------|
| Resource Group | `rg-teamskills-prod` | Active |
| Frontend Container App | `ca-frontend-teamskills` | Running ✅ |
| Backend Container App | `ca-backend-gvojq4dgzbtk4` | Running ✅ |
| PostgreSQL Flexible Server | `psql-gvojq4dgzbtk4` | Was **Stopped** → Manually started ✅ |
| Wake Function | `wake-function/` | Code exists, deployment status unknown |

**Note:** The resource group is `rg-teamskills-prod`, NOT `rg-teamskills`. Documentation/scripts referencing `rg-teamskills` will fail.

## Recommended Actions

| Priority | Action | Owner |
|----------|--------|-------|
| **P0** | Add `connectionTimeoutMillis: 5000` to `db.js` Pool config | Fenster (Backend) |
| **P1** | Integrate wake-function into frontend timeout/error flow | Verbal (Frontend) + McManus (DevOps) |
| **P1** | Add DB health check to backend startup and `/api/health` | Fenster (Backend) |
| **P2** | Decide: disable PG auto-pause vs. implement keep-alive ping | Keaton (Architecture) |
| **P2** | Document that CSV sync is the current data path (not live SharePoint API) | Keaton (Lead) |
| **P3** | Evaluate SharePoint Graph API access given corp tenant constraint | Kobayashi (Auth) |

---

### 2026-03-02T18:55:00Z: Round Table Priority Review

**By:** Eric Hansen (via Knights of the Round Table — Claude Opus, GPT-5.3-Codex, Gemini 3 Pro)  
**What:** Three-model review of backlog priorities reached consensus on these key findings

**Unanimous (High Confidence):**
- health-check-db is urgent — /health lies when DB is down, dangerous with ACA liveness probes
- cicd-subscription-set is cheap insurance (5 min, prevents wrong-subscription deploys)
- bootstrap-sp-graph should be deferred until tenant admin access available
- SharePoint sync service has zero tests — significant regression risk

**Critical Discovery (NOT on original backlog):**
- process.exit(-1) in backend/db.js kills the backend on transient DB errors — WILL crash in production with auto-pausing Flex Server
- No SIGTERM handler — ACA scale-down kills in-flight requests
- These are MORE urgent than any existing backlog item

**Nuanced Finding:**
- fetch-timeout (15s) would actively break the app during DB wake (45-60s) — wire-wake-url MUST come first
- auto-migrate needs a real migration framework, not raw ALTER TABLE in scaled environment

**Agreed Priority Order:**
1. Fix process.exit(-1) + add SIGTERM handler (~20 min)
2. health-check-db (~15 min)
3. cicd-subscription-set (~5 min)
4. wire-wake-url (~15 min)
5. fetch-timeout with safe timeout value (~20 min)
6. test-new-code (1-2 hrs)
7. cicd-rollback or ACA canary (2 hrs)
8. auto-migrate with proper framework (1 hr)
9. e2e-regression (30 min)
10. bootstrap-sp-graph (deferred)

**Why:** Three independent AI models analyzed from Devil's Advocate, Explorer, and Steelman perspectives. Consensus was strong on items 1-5.

---

### 2026-03-02T20:15:00Z: User Directive — Authentication is MANDATORY on Production

**By:** Eric Hansen (via Copilot)  
**What:** Production absolutely needs a login. 100%. Always will. The data is PII (real employee names + skills proficiency levels). Never suggest removing auth or running in "demo mode" in production. This is non-negotiable.  
**Why:** User request — captured for team memory. Skills matrix data is PII. Exposing it without authentication would be a security and privacy violation.

---

### Staging Auth Strategy — Cross-Tenant Barrier Analysis

**Author:** Kobayashi (Auth/Security)  
**Date:** 2026-03-01  
**Status:** Analysis and recommendation (revised post "Zero Permissions" constraint)

(See full analysis at `.squad/decisions/inbox/kobayashi-staging-auth-strategy.md`)

**Revised Recommendation:** Option 2 — Skip Auth in Staging (with backend NODE_ENV=staging write protection + isolated DB with synthetic data) is the only viable path given zero permissions in tenant 72f988bf.

**Decision Summary:**
- ~~Option 1: Stable Staging URL~~ — IMPOSSIBLE (requires Portal access to tenant 72f988bf)
- ~~Option 3: New App Registration~~ — Over-engineered for solo dev with one active PR at a time
- **Option 2 (Recommended):** Deploy staging without MSAL; frontend demo mode + backend write protection gates access

---

### Replace azd with Direct Azure CLI for Production Deployment

**Author:** McManus (DevOps)  
**Date:** 2026-07-25  
**Status:** Accepted

## Context

The CI/CD production deploy job uses `azd provision` + `azd deploy` (introduced in the "CI/CD Rewrite: Azure Developer CLI" decision). This worked in theory but fails in practice because the production infrastructure is **brownfield** — created incrementally over time, not by azd.

### Specific Failures

1. **Resource naming divergence:** `azd provision` with `AZURE_ENV_NAME=prod` generates a `resourceToken` (`ywmkgjccarkve`) that produces resource names like `ca-backend-ywmkgjccarkve`, but the actual production backend is `ca-backend-gvojq4dgzbtk4`. azd creates entirely new resources instead of updating existing ones.

2. **ACR pull failure:** The newly-created Container App can't pull images from ACR because the managed identity AcrPull role assignment hasn't been created yet (chicken-and-egg problem in Bicep ordering).

3. **Service principal permission errors:** The CI/CD service principal lacks `Microsoft.Authorization/roleAssignments/write` on storage and postgres resources, causing the wake-function Bicep module to fail when creating role assignments.

### Why azd Can't Manage This Infrastructure

azd's resource naming is deterministic based on `AZURE_ENV_NAME` + subscription + location. The existing production resources were created with a different naming scheme (some manually, some by earlier Bicep runs with different parameters). There is no way to make azd "adopt" these existing resources without renaming everything in Azure — a risky, disruptive migration.

## Decision

Replace `azd provision` + `azd deploy` in the CI/CD workflow with direct Azure CLI commands that target existing resources by their actual names:

1. `az acr build` to build and push images to the existing ACR
2. `az containerapp update` to deploy new image tags to existing Container Apps
3. Direct `az containerapp show` queries for smoke test URL discovery

Resource names use the `${{ vars.X || 'fallback' }}` pattern — configurable via GitHub repository variables with working defaults matching current production.

### GitHub Variables (optional overrides)

| Variable | Default | Purpose |
|----------|---------|---------|
| `RESOURCE_GROUP` | `rg-teamskills-prod` | Production resource group |
| `ACR_NAME` | `crywmkgjccarkve` | Azure Container Registry |
| `BACKEND_APP` | `ca-backend-gvojq4dgzbtk4` | Backend Container App |
| `FRONTEND_APP` | `ca-frontend-teamskills` | Frontend Container App |

## What Changed

- **Removed:** `azure/setup-azd@v2`, `azd auth login`, `azd env new/set`, `azd provision`, `azd deploy`
- **Kept:** Lint job, test job, `azure/login@v2`, `environment: production`, smoke test logic, deployment summary
- **Added:** `az acr build` (backend + frontend), `az containerapp update` (backend + frontend)
- **Kept:** `azure.yaml` — still used for local development with azd, not CI/CD

## Rationale

### Why not fix azd instead?

Fixing azd would require either:
- Renaming all production Azure resources to match azd's naming scheme (risky, causes downtime)
- Implementing azd's `infra.provider: custom` with manual resource mapping (complex, fragile)
- Both options are more work and more risk than direct CLI commands

### Why direct CLI is better for this case

- **Explicit targeting:** Commands reference exact resource names, no naming algorithm surprises
- **No permission escalation needed:** `az containerapp update` and `az acr build` don't create role assignments
- **Simpler failure modes:** Each step does one thing; failures are obvious and debuggable
- **Existing pattern:** The PR staging workflow already uses direct Azure CLI (arm-deploy + az commands)

### What we lose

- **No automatic infrastructure updates:** Bicep changes (env vars, auth config, scaling rules) require manual deployment. This is acceptable because:
  - Infrastructure changes are infrequent
  - They can be applied manually via `az containerapp update` or Azure Portal
  - The Bicep files remain as documentation/reference
- **azd consistency:** Local dev uses azd, CI uses CLI — two deployment paths. Acceptable trade-off given azd's incompatibility with brownfield resources.

## Consequences

- Production deployments will target the correct existing resources reliably
- The ACR pull and role assignment errors are eliminated (no new resources created)
- Infrastructure changes require separate manual steps (not automated in CI)
- Bicep files in `infra/` remain as reference but are not executed in CI

## Supersedes

This decision supersedes "CI/CD Rewrite: Azure Developer CLI (azd)" from 2026-02-27 for production deployment. The analysis in that decision about container-apps-deploy-action's limitations was correct, but azd proved incompatible with brownfield infrastructure.
