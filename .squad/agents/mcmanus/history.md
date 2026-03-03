# McManus — History

## Project Context
- **Project:** Team Skills Tracker — Azure Container Apps, Bicep IaC, GitHub Actions CI/CD
- **User:** Eric Hansen
- **IaC:** `infra/main.bicep`, `infra/core/` (postgres, container apps, OpenAI, security), `infra/app/` (backend, frontend, agent, wake-function)
- **CI/CD:** `ci-cd.yml` (main pipeline), `pr-staging.yml` (PR preview), `pr-cleanup.yml` (cleanup)
- **Staging Bicep:** Must include env vars (VITE_API_URL, VITE_AZURE_AD_CLIENT_ID, VITE_AZURE_AD_TENANT_ID) on frontend container
- **PR staging workflow:** Has smoke test that validates config.js after deploy
- **Azure auth:** Individual secrets in JSON format for CI/CD
- **GitHub Environment:** Staging workflows use `environment: staging`, not `environment: production`
- **Deployment region:** Prefer Central US
- **Docker:** `docker-compose.yml`, `docker-compose.override.yml`, `docker-compose.test.yml`

## Learnings
- **Entra ID app registration:** App ID `69c41897-2a3c-4956-b78d-56670cdb5750` — client secrets created via `az ad app credential reset --append`
- **AZURE_AD_CLIENT_SECRET** stored in both `staging` and `production` GitHub environments (separate from AZURE_CLIENT_SECRET used for Azure service principal login)
- **Dependabot PRs:** `pr-staging.yml` deploy-staging job skips Dependabot PRs via `if: github.actor != 'dependabot[bot]'` — avoids wasting staging infra on dependency bumps
- **Two auth secrets exist:** `AZURE_CLIENT_SECRET` (service principal for Azure login) vs `AZURE_AD_CLIENT_SECRET` (Entra ID app for user-facing auth) — don't confuse them
- **Entra ID redirect URI automation:** `pr-staging.yml` registers `/.auth/login/aad/callback` URIs on the Entra ID app after deploy; `pr-cleanup.yml` removes them on PR close. Uses `az ad app update --web-redirect-uris` which REPLACES all URIs, so must merge existing + new. Steps skip when `vars.AZURE_AD_CLIENT_ID` is empty.
- **Frontend Easy Auth causes double-login:** Easy Auth on the frontend Container App forces a Microsoft login before the SPA loads, then MSAL in the React app requires a second login. Removed `frontendAuth` authConfigs from both staging (`infra/staging/main.bicep`) and production (`infra/app/frontend.bicep`). Backend keeps Easy Auth to protect the API. Frontend auth is handled entirely by MSAL in the React app.
- **Frontend auth env vars:** `infra/app/frontend.bicep` now passes `VITE_AZURE_AD_CLIENT_ID` and `VITE_AZURE_AD_TENANT_ID` as env vars to the frontend container, matching how staging does it. Removed `azureAdClientSecret` param and secrets block — SPAs don't need client secrets (MSAL.js uses PKCE). Added Easy Auth disabled block to ensure Easy Auth stays off. `infra/main.parameters.json` now passes `azureAdClientId` and `azureAdTenantId` from azd env vars to Bicep.
- **CI/CD rewritten to use azd:** The production deploy job in `.github/workflows/ci-cd.yml` now uses Azure Developer CLI (`azd provision` + `azd deploy`) instead of `container-apps-deploy-action`. This ensures Bicep infrastructure changes (env vars, auth config, Easy Auth settings) are applied on every deployment. The action only updated container images, NEVER infrastructure — root cause of recurring auth failures. New workflow: `azd auth login` → `azd env set` (all Bicep params) → `azd provision` (apply Bicep) → `azd deploy` (build + push images + update containers). Added smoke test step that validates auth config endpoints after deploy to catch misconfigurations immediately. Removed dangerous tenant fallback `${{ vars.AZURE_AD_TENANT_ID || vars.AZURE_TENANT_ID || '' }}` and manual docker build/push commands.
- **PR #28 review (2026-03-02):** Reviewed open PR #28 plus merged PRs #25 and #27. Key findings: (1) `AZURE_ENV_NAME production→prod` fix is critical — `resourceToken` is derived from env name, wrong name targets wrong resource group. (2) Dynamic URL discovery replaces hardcoded URLs — proper pattern using `azd env get-value` with `az` CLI fallback. (3) Added `azure/login@v2` step is required because smoke test fallback uses `az containerapp show`. (4) Entra ID redirect URI management removed from staging/cleanup workflows — correct decision since Easy Auth is disabled on both frontend and backend. (5) Staging Bicep still declares `azureAdClientSecret` param (line 33) and uses it in frontend secrets block (line 220) but PR #28 no longer passes it — dead code that should be cleaned up. (6) PR staging uses `arm-deploy` while production uses `azd` — intentional architectural split (staging is resourceGroup-scoped, prod is subscription-scoped) but creates maintenance divergence.
- **CI/CD pipeline health:** Lint and test jobs pass consistently. Production deploy hasn't been validated end-to-end yet (PR #28 not merged). PR staging workflow is functional with good smoke tests covering health, config.js injection, and cross-connectivity.
- **Staging NODE_ENV fix:** PR #28 changes staging backend `NODE_ENV` from `production` to `staging` — critical fix since `requireAuth` returns 503 in production when auth is unconfigured, which would block the demo user injection added in the same PR.
- **Staging cleanup (azureAdClientSecret removal):** Removed dead `azureAdClientSecret` param, its `@secure()` decorator, and the `concat()` conditional secrets block from `infra/staging/main.bicep`. Simplified frontend secrets to a plain array with just `registry-password`. Also removed the corresponding `azureAdClientSecret` parameter from the `arm-deploy` step in `pr-staging.yml`. Now matches production Bicep which already removed this.
- **PR staging workflow hardcoded values:** Extracted `ACR_NAME` and `ACR_RESOURCE_GROUP` from hardcoded values to `${{ vars.ACR_NAME || 'fallback' }}` pattern in `pr-staging.yml`. Allows override via GitHub repository variables while keeping current values as defaults.
- **azd incompatible with brownfield prod infra:** `azd provision` generates a `resourceToken` from env name that creates NEW resources (e.g., `ca-backend-ywmkgjccarkve`) instead of updating existing ones (`ca-backend-gvojq4dgzbtk4`). Also hits permission errors on role assignments and ACR pull chicken-and-egg. Root cause: prod resources were created incrementally, not by azd, so naming schemes don't match. No fix short of renaming all Azure resources.
- **Replaced azd with direct Azure CLI in CI/CD:** Production deploy now uses `az acr build` + `az containerapp update` targeting exact existing resource names via `${{ vars.X || 'fallback' }}` pattern. Removed `azure/setup-azd@v2`, `azd auth login`, `azd env new/set`, `azd provision`, `azd deploy`. Kept lint/test jobs, `azure/login@v2`, `environment: production`, smoke test, deployment summary. `azure.yaml` stays for local dev. Decision documented in `.squad/decisions/inbox/mcmanus-cicd-direct-cli.md`.

- **INIT_SECRET added to IaC and CI/CD:** Production deploy (`ci-cd.yml`) now uses `--set-secrets init-secret="${{ secrets.INIT_SECRET }}"` + `--set-env-vars INIT_SECRET=secretref:init-secret` so INIT_SECRET survives deploys. Bicep (`backend.bicep`, `main.bicep`) uses `@secure() param initSecret` + secretRef pattern matching PGPASSWORD. `main.parameters.json` maps `${INIT_SECRET}` azd env var. Staging Bicep moved from plaintext env var to secretRef (value still deterministic from PR number — intentional for ephemeral staging). **Action required:** Add `INIT_SECRET` to GitHub Environment `production` secrets before next deploy.

## ⛔ CRITICAL CONSTRAINT (2026-03-02)
**ZERO PERMISSIONS in Microsoft corp tenant 72f988bf. Nobody on this team can do ANYTHING there — not programmatically, not manually, not via Portal. Eric does NOT have admin permissions. This is PERMANENT.**

Implications:
- CANNOT modify redirect URIs on the Entra app (app ID 69c41897)
- CANNOT use az ad, Bicep Microsoft.Graph, or Terraform AzureAD against this tenant
- CANNOT ask Eric to manually fix things in Portal — he doesn't have permissions either
- All CI/CD automation targeting tenant 72f988bf WILL FAIL
- Code in pr-staging.yml and pr-cleanup.yml that uses az ad app update must be REMOVED

- **PostgreSQL cold-start fix (keep-alive cron):** Azure PostgreSQL Flexible Server auto-pauses after inactivity, causing 15-60s hangs on first request. Added `.github/workflows/keep-alive.yml` — a GitHub Actions scheduled workflow that pings the backend `/health` endpoint every 10 minutes. The health check triggers a DB connection, keeping the Flex Server awake. Zero-cost (GitHub Actions free tier), zero-infra, no app code changes. If cron alone isn't enough, the `wake-function/` Azure Function can be layered on top later.
