# Staging Environment (Per-PR Preview)

## Overview

The staging environment provides **per-PR preview deployments** automatically managed by GitHub Actions. Each pull request gets its own isolated Azure Container Apps environment where you can test authentication, API connectivity, and frontend behavior with real cloud infrastructure — without deploying to production.

### What Happens on PR Activity

| Event | Workflow | What It Does |
|-------|----------|-------------|
| **PR opened** | `pr-staging.yml` | Deploys Bicep → Creates app registration + Container Apps + PostgreSQL. Outputs staging URL in PR comment. |
| **PR updated** | `pr-staging.yml` | Re-deploys with latest code. |
| **PR closed** | `pr-cleanup.yml` | Deletes app registration and all Azure resources. |

---

## Bootstrap Prerequisites: ONE-TIME Entra ID Setup

Before the first staging deployment can succeed, you must grant the CI/CD service principal permission to create app registrations in your Entra ID tenant.

### Why This Is Needed

The staging Bicep template uses the **Microsoft Graph resource provider** to dynamically create per-PR Entra ID app registrations (instead of hardcoding a single app like production does). The CI/CD service principal (`github-teamskills`) needs explicit permission to create and manage these apps.

### Prerequisites (One-Time Admin Setup)

**Prerequisites:**
- You must be an **admin in Entra ID tenant `9c74def4-40b4-4c76-be03-235975db1351`** (the managed environment tenant)
- You have `az` CLI installed locally

**Steps:**

1. **Login to the managed environment tenant:**
   ```bash
   az login --tenant 9c74def4-40b4-4c76-be03-235975db1351
   ```
   You'll be prompted to authenticate. Use your admin credentials for this tenant.

2. **Grant the CI/CD service principal Graph API permission:**
   ```bash
   az ad app permission add \
     --id 9d8d893b-c810-407e-98bb-5e3b83dc056d \
     --api 00000003-0000-0000-c000-000000000000 \
     --api-permissions 18a4783c-866b-4cc7-a460-3d5e5662c884=Role
   ```
   This grants `Application.ReadWrite.OwnedBy` permission (role ID `18a4783c...`). This allows the service principal to create and manage app registrations owned by itself.

3. **Grant admin consent:**
   ```bash
   az ad app permission admin-consent --id 9d8d893b-c810-407e-98bb-5e3b83dc056d
   ```
   This allows the service principal to use the permission without users approving it each time.

**That's it.** This is a **one-time setup** per tenant. Once done, all future PR staging deployments will work automatically.

### Verifying Success

After running the above commands, test a staging deploy by opening a pull request. The GitHub Actions `pr-staging` workflow should:
- ✅ Create the app registration
- ✅ Deploy Container Apps
- ✅ Comment a staging URL on the PR

If the workflow fails with an auth error, check:
- Did you run the commands while logged into the correct tenant (`9c74def4...`)?
- Did you run **both** the `permission add` and `permission admin-consent` commands?

---

## How Staging Deployment Works

### Deployment Flow

1. **PR opened** → `pr-staging.yml` workflow triggered
2. **Bicep provision:**
   - Deploys a resource group for the PR
   - **Creates a new Entra ID app registration** (via Microsoft.Graph provider)
   - Configures SPA redirect URIs (the frontend container FQDN — MSAL uses `window.location.origin`)
   - Sets OAuth2 permission scopes (`access_as_user`)
3. **Container deployment:**
   - Builds and pushes Docker images to Azure Container Registry (ACR)
   - Deploys frontend, backend, and agent containers
4. **Post-deploy configuration:**
   - Sets `identifierUris` on the app registration (must be done after Azure DNS is available; can't self-reference in Bicep)
5. **Validation:**
   - Smoke test runs to verify auth endpoints and config.js injection
   - GitHub comment posted with staging URL
6. **PR closed** → `pr-cleanup.yml` workflow triggered
   - Deletes app registration
   - Deletes all Azure resources (resource group, Container Apps, PostgreSQL, etc.)

### Staging vs. Production Auth

| Aspect | Staging (Per-PR) | Production |
|--------|------------------|------------|
| **App Registration** | Created by Bicep (`Microsoft.Graph/applications`) | Managed separately; pre-existing |
| **Tenant** | Team's managed tenant `9c74def4...` | Microsoft corp tenant `72f988bf...` |
| **Redirect URIs** | Set by Bicep + post-deploy step | Manually registered once |
| **Lifecycle** | Created on PR open, deleted on PR close | Permanent |
| **Who owns it** | CI/CD service principal | Microsoft IT (we have no perms) |

---

## Cross-Tenant Architecture Constraint

### Why Staging and Production Use Different Tenants

**The team has ZERO permissions in tenant `72f988bf` (Microsoft corp).** Nobody can:
- Modify the Entra ID app registration
- Add/remove redirect URIs
- Change OAuth2 scopes
- Automate anything via `az ad` CLI or Bicep Microsoft.Graph

This is a permanent organizational constraint — Eric (project lead) does not have admin permissions in that tenant.

**Consequence:** Staging CANNOT reuse the production app registration (`69c41897-2a3c-4956-b78d-56670cdb5750`). Instead, staging creates temporary app registrations in the team's own tenant (`9c74def4`), which we fully control.

**See:** [`.squad/decisions.md`](../.squad/decisions.md#-constraint-zero-permissions-in-microsoft-corp-tenant-72f988bf--permanent) for full decision history and why this affects CI/CD automation.

---

## Troubleshooting

### PR Staging Workflow Fails with "Permission Denied" on App Registration

**Cause:** The CI/CD service principal doesn't have `Application.ReadWrite.OwnedBy` permission.

**Fix:** Re-run the bootstrap commands above (step 2 and 3).

### Staging URL Commented but Auth Doesn't Work

**Possible causes:**
- The post-deploy step failed to set `identifierUris` (check workflow logs)
- The redirect URI in the app registration doesn't match the actual frontend URL (compare with `az ad app show`)

**Debug:** 
```bash
# View the app registration created for your PR
az ad app list --display-name "teamskills-pr-*" --query "[].{id:appId,name:displayName,redirectUris:web.redirectUris}"
```

### PR Cleanup Workflow Fails

**Cause:** Usually a transient Azure API issue (resource group deletion can be slow).

**Fix:** Re-run the workflow manually, or delete the resource group directly:
```bash
az group delete --name rg-teamskills-pr-{PR_NUMBER} --no-wait
```

---

## Local Development vs. Staging

| Scenario | Use Local | Use Staging |
|----------|-----------|-----------|
| Testing auth flow locally | ✅ Use demo user picker (no Entra ID needed) | — |
| Testing real Entra ID login | — | ✅ Staging has real Azure auth |
| Testing API + database integration | ✅ Use docker-compose.yml | ✅ Real PostgreSQL in Azure |
| Performance testing | — | ✅ Real cloud infra |
| Testing deployment automation | — | ✅ Full GitHub Actions workflow |

---

## For Developers

### Running Your Code in Staging

1. Push a feature branch and open a pull request
2. GitHub Actions automatically deploys to staging (unless it's a Dependabot PR)
3. Wait for the `deploy-staging` job to complete (usually 3–5 minutes)
4. Click the staging URL posted in the PR comment
5. Test with real Entra ID authentication

### Making Changes While PR Is Open

Each push to the PR branch re-runs `pr-staging.yml` and updates the existing staging environment with your latest code. No need to manually trigger anything.

### Skipping Staging (Dependabot PRs)

Dependabot PRs automatically skip the staging deploy (via `if: github.actor != 'dependabot[bot]'`) to save Azure costs. Dependency PRs are validated via linting and unit tests only.

---

## Related Documentation

- **Authentication Setup:** [docs/authentication.md](./authentication.md)
- **Docker/Local Dev:** [DOCKER.md](../DOCKER.md)
- **Testing:** [TESTING.md](../TESTING.md)
- **Infrastructure Code:** [infra/README.md](../infra/README.md)
