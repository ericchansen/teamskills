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
