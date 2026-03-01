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
