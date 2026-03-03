# Decision: INIT_SECRET managed via IaC and CI/CD

**Author:** McManus (DevOps)
**Date:** 2026-07-08
**Status:** Implemented

## Context
INIT_SECRET was manually set on the Azure Container App. Every `az containerapp update` deploy wipes env vars not included in the `--set-env-vars` list, causing INIT_SECRET to be lost and requiring manual re-entry.

## Decision
Add INIT_SECRET to IaC and CI/CD using the same `@secure()` param + secretRef pattern as PGPASSWORD:

1. **Bicep** (`backend.bicep` → `main.bicep` → `main.parameters.json`): `@secure() param initSecret` → container secret `init-secret` → env var `INIT_SECRET` via `secretRef`
2. **CI/CD** (`ci-cd.yml`): `--set-secrets init-secret="${{ secrets.INIT_SECRET }}"` + `--set-env-vars INIT_SECRET=secretref:init-secret`
3. **Staging** (`staging/main.bicep`): Moved from plaintext env var to secretRef. Value remains deterministic (`staging-init-${prNumber}`) — intentional for ephemeral PR environments.

## Action Required
- **Add `INIT_SECRET` to GitHub Environment `production` secrets** with the current production value before the next deploy merges.

## Alternatives Considered
- **Hardcode in Bicep**: Security risk — secret would be in source control.
- **Leave manual**: Fragile — every deploy wipes it.
- **Azure Key Vault reference**: Overkill for a single secret; adds infra dependency.

## Impact
- No application code changes
- No breaking changes — `initSecret` defaults to `''` if not provided
- Staging behavior unchanged (same deterministic value, just stored as secret now)
