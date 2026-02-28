# CI/CD Rewrite: Azure Developer CLI (azd)

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
