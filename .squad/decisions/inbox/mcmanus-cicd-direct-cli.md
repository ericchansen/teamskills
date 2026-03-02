# Decision: Replace azd with Direct Azure CLI for Production Deployment

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
