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
