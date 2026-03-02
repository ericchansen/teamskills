# Staging Auth Strategy — Cross-Tenant Barrier Analysis

**Author:** Kobayashi (Auth/Security)  
**Date:** 2025-03-01  
**Status:** Security recommendation

---

## Problem Statement

PR staging deploys create dynamic URLs (`ca-frontend-pr{N}.{cae-domain}`) that require SPA redirect URIs in the Entra app registration (`69c41897-2a3c-4956-b78d-56670cdb5750`). The app lives in tenant `72f988bf` (Microsoft corp), but the CI/CD service principal lives in tenant `9c74def4` (managed env) and **cannot authenticate cross-tenant** due to `signInAudience: AzureADMyOrg` on its backing app.

**Current state:** Workflows contain `az ad app update` steps to auto-manage redirect URIs, but these will **fail permanently** — no programmatic access to the app registration exists.

---

## Option Analysis

### Option 1: Stable Staging URL (Single Shared Environment)

**Approach:**  
Deploy one shared `ca-frontend-staging` + `ca-backend-staging` Container App (not per-PR). Eric manually adds **one** redirect URI in the Azure Portal: `https://ca-frontend-staging.{cae-domain}`. Only one PR can be staged at a time.

#### Security Assessment

✅ **Strengths:**
- **Minimal attack surface** — one staging URL, one redirect URI registration (easy to audit)
- **Production parity** — same auth config as prod (manually registered, stable)
- **No cross-tenant automation** — zero dependency on broken SP permissions
- **Easy to secure** — CORS, CSP, and firewall rules apply to a single known origin

⚠️ **Weaknesses:**
- **Shared state** — if one PR deploys, it overwrites the previous PR's environment
- **No isolation** — multiple PRs can't be tested simultaneously (low risk for solo dev)
- **Manual fallback** — if URL needs to change (new region, new CAE), Eric must update the redirect URI manually

#### Operational Impact
- **One-time cost:** Eric manually adds `https://ca-frontend-staging.{cae-domain}` to SPA redirect URIs in Azure Portal
- **Recurring cost:** None — URL is stable
- **CI/CD changes:** Minimal — remove per-PR naming (`ca-frontend-staging` instead of `ca-frontend-pr${prNumber}`)

#### Security Verdict
**Low risk.** Single shared staging is a pragmatic trade-off for a small team. The lack of per-PR isolation is acceptable when:
1. Only one dev is working on the repo (Eric)
2. PRs are reviewed sequentially, not in parallel
3. Staging is for functional validation, not load testing or security testing

---

### Option 2: Skip Auth in Staging

**Approach:**  
Deploy staging without MSAL (remove `VITE_AZURE_AD_CLIENT_ID` and `VITE_AZURE_AD_TENANT_ID` from staging Bicep). Frontend shows demo user picker (localhost-only restriction remains). Backend runs in demo mode (unauthenticated passthrough, acceptable when `NODE_ENV=staging`). Test functionality without auth. Auth flows are already proven in production.

#### Security Assessment

✅ **Strengths:**
- **No redirect URI management needed** — staging runs without Entra ID dependency
- **Simplest implementation** — remove two Bicep parameters, done
- **Fastest deploys** — no MSAL init, no Azure AD network calls
- **Already gated** — frontend demo mode is localhost-only (decision 2026-02-27), so deployed staging without auth shows "contact your administrator" error to real users

⚠️ **Weaknesses:**
- **No auth flow validation** — can't test MSAL redirect, token acquisition, or RBAC in staging
- **Production divergence** — staging behavior differs from prod (auth vs no-auth)
- **Regression risk** — auth bugs could slip through if only tested in prod

❌ **Critical Concerns:**
- **False security posture** — staging deployment without auth **looks** accessible but demo mode is gated to localhost. External users hitting a staging URL will see an error, but this is not obvious from the deployment or the Bicep template.
- **Accidental exposure** — if the localhost-only check (`window.location.hostname`) is ever removed or bypassed (e.g., via a bug, refactor, or conditional logic), staging becomes an unauthenticated public app with access to a real database.
- **No defense in depth** — relies entirely on a single JavaScript check in the frontend. No backend enforcement for staging environments (backend allows demo mode when `NODE_ENV=staging`).

#### Operational Impact
- **One-time cost:** Remove `azureAdClientId` and `azureAdTenantId` from `infra/staging/main.bicep` + workflow
- **Recurring cost:** None
- **CI/CD changes:** Delete auth-related Bicep parameters, remove redirect URI steps from workflows

#### Security Verdict
**Medium risk.** This option is acceptable **only if** the staging database is isolated and contains no production data. The risk is that a single frontend bug (localhost check bypass) exposes unauthenticated access to the staging backend. For a prototype/demo app with synthetic data, this is tolerable. For an app handling real user data or sensitive team information, this is **not recommended**.

**Mitigation required if choosing this option:**
1. Add a backend environment check that **blocks** all write operations when `NODE_ENV=staging` and auth is not configured (read-only demo mode).
2. Add a separate staging database with synthetic seed data only — never real user data.
3. Document in the Bicep template that staging is unauthenticated by design.

---

### Option 3: New App Registration in Tenant 9c74def4

**Approach:**  
Create a **separate** Entra ID app registration in the managed env tenant (`9c74def4`) specifically for staging environments. Bicep manages the app registration as a resource (`Microsoft.Graph/applications` via Bicep AzAPI or Azure CLI). CI/CD SP has full permissions in this tenant. Staging uses a different client ID than production.

#### Security Assessment

✅ **Strengths:**
- **Full automation** — Bicep can create/update the app registration, manage redirect URIs programmatically
- **Per-PR isolation** — each PR can register its own redirect URIs without manual intervention
- **Production parity** — staging validates the same MSAL auth flows as production
- **Tenant isolation** — staging app is in managed tenant, production app is in corp tenant (blast radius containment)
- **Future-proof** — scales to multiple PRs, multiple devs, or automated testing

⚠️ **Weaknesses:**
- **Complexity overhead** — two app registrations to maintain (staging + production)
- **Bicep limitations** — `Microsoft.Graph/applications` is not a native Bicep resource type; requires AzAPI provider or Azure CLI scripting
- **Drift risk** — staging and production app configurations could diverge over time (e.g., token version, optional claims, API permissions)
- **Initial setup cost** — requires creating the app registration, assigning API permissions (`api://{clientId}/access_as_user` scope), and configuring service principal access

❌ **Critical Concerns:**
- **Token interoperability** — if staging uses a different client ID, tokens minted for staging won't work in production (expected, but could cause confusion during testing)
- **Configuration drift** — must ensure staging app matches production app settings (token version, optional claims, group claims, etc.)

#### Operational Impact
- **One-time cost:** High
  1. Create a new Entra ID app registration in tenant `9c74def4` (manually or via Bicep AzAPI)
  2. Configure app settings to match production (API permissions, token version, redirect URIs)
  3. Add Bicep resources to manage app registration in `infra/staging/main.bicep`
  4. Update GitHub secrets with staging client ID
- **Recurring cost:** Medium — must maintain parity between two app registrations when changing auth config
- **CI/CD changes:** Moderate — add Bicep resources for app registration, update redirect URI logic to use staging-specific app

#### Security Verdict
**Low risk, high complexity.** This is the **gold standard** for a production-grade setup, but it's over-engineered for a solo developer with a small app. The overhead of maintaining two app registrations is only justified if:
1. Multiple developers are working on the repo simultaneously (parallel PRs)
2. Staging environments run long-term and require full auth validation
3. The team has capacity to manage infrastructure complexity

For a small team (1 dev + AI), this is **not recommended** unless the project scales significantly.

---

## ⛔ Option 1 RULED OUT — Zero Permissions in Tenant 72f988bf

**Option 1 requires adding a redirect URI to the Entra app in tenant 72f988bf. Nobody on this team has ANY permissions in that tenant — not programmatic, not Portal, not manual. Option 1 is permanently dead.**

## Revised Recommendation: **Option 2 — Skip Auth in Staging** (with mitigations)

**Rationale:**
1. **No dependency on tenant 72f988bf** — only option that works without ANY cross-tenant access
2. **Simplest implementation** — remove two Bicep parameters
3. **Acceptable risk with mitigations** — add backend NODE_ENV=staging write protection + isolated staging DB with synthetic data
4. **Auth flows proven in production** — prod is the definitive auth test

**Required mitigations (non-negotiable):**
1. Backend: block write operations when `NODE_ENV=staging` and auth is not configured (read-only demo mode)
2. Staging database: isolated, synthetic seed data only — never real user data
3. Document in Bicep template that staging is unauthenticated by design

**Option 3 (New App Registration) is viable but over-engineered for a solo dev.** If the project scales to multiple developers needing parallel PR auth testing, revisit Option 3 at that time.

---

## Implementation Plan for Option 1

### Step 1: Update Bicep Template (`infra/staging/main.bicep`)

**Change resource naming from per-PR to shared:**

```bicep
// Replace:
var resourceToken = 'pr${prNumber}'

// With:
var resourceToken = 'staging'
```

**Remove `prNumber` parameter:**

```bicep
// Delete:
@description('PR number for unique resource naming')
param prNumber string
```

**Update tags:**

```bicep
// Replace:
var tags = { 
  'pr-staging': 'true'
  'pr-number': prNumber
}

// With:
var tags = { 
  'environment': 'staging'
  'managed-by': 'github-actions'
}
```

### Step 2: Update PR Staging Workflow (`.github/workflows/pr-staging.yml`)

**Remove per-PR naming:**

```yaml
# Delete this step:
- name: Setup environment variables
  id: setup
  run: |
    PR_NUMBER=${{ github.event.pull_request.number }}
    echo "pr_number=${PR_NUMBER}" >> $GITHUB_OUTPUT
    echo "image_tag=${{ github.sha }}" >> $GITHUB_OUTPUT
```

**Update Bicep parameter passing:**

```yaml
# Replace:
parameters: >
  prNumber=${{ steps.setup.outputs.pr_number }}
  postgresPassword=${{ steps.pg_password.outputs.password }}
  imageTag=${{ steps.setup.outputs.image_tag }}
  # ...

# With:
parameters: >
  postgresPassword=${{ steps.pg_password.outputs.password }}
  imageTag=${{ github.sha }}
  # ...
```

**Remove redirect URI management steps:**

Delete these steps entirely:
- "Login to Entra ID tenant for app registration"
- "Register SPA redirect URI in Entra ID"
- "Re-login to Azure resource tenant"

**Update PR comment to reflect shared staging:**

```yaml
const body = `🚀 **Shared Staging Environment**

| Resource | URL |
|----------|-----|
| **Frontend** | ${frontendUrl} |
| **Backend** | ${backendUrl} |

**Commit:** \`${sha.substring(0, 7)}\`
**Status:** ✅ Deployed (shared environment updated)

> ⚠️ This is a shared staging environment. Opening a new PR will redeploy and replace this environment.
`;
```

### Step 3: Update PR Cleanup Workflow (`.github/workflows/pr-cleanup.yml`)

**Change to no-op (staging environment persists):**

Option A: Skip cleanup entirely — staging environment stays alive between PRs
Option B: Stop container apps without deleting them (saves compute cost when no PR is active)

**Recommended: Option B (stop containers, keep infrastructure)**

```yaml
- name: Stop staging containers (preserve database)
  run: |
    RG="${{ env.STAGING_RESOURCE_GROUP }}"
    
    echo "Stopping staging containers..."
    
    # Stop Container Apps (scales to zero replicas, stops billing)
    for APP in $(az containerapp list -g "$RG" --query "[?tags.environment=='staging'].name" -o tsv); do
      echo "Scaling down: ${APP}"
      az containerapp update -g "$RG" -n "$APP" --min-replicas 0 --max-replicas 0
    done
    
    # Stop PostgreSQL server (no billing when stopped)
    for PG in $(az postgres flexible-server list -g "$RG" --query "[?tags.environment=='staging'].name" -o tsv); do
      echo "Stopping PostgreSQL: ${PG}"
      az postgres flexible-server stop -g "$RG" -n "$PG"
    done
    
    echo "✅ Staging environment stopped (will auto-start on next deploy)"
```

**Remove redirect URI cleanup step** (Delete this step entirely):
- "Login to Entra ID tenant for app registration"
- "Remove SPA redirect URI from Entra ID"
- "Re-login to Azure resource tenant"

### ~~Step 4: Manual One-Time Setup~~ — REMOVED

**This step required Portal access to tenant 72f988bf. Eric has zero permissions there. This entire Option 1 implementation plan is moot — see revised recommendation above (Option 2).**

### Step 5: Validation

1. Open a test PR
2. Workflow deploys to shared staging environment
3. Navigate to staging URL
4. Click "Sign in with Microsoft"
5. Verify MSAL redirect flow succeeds
6. Verify `/api/auth/me` returns user profile
7. Close the PR
8. Verify cleanup workflow stops containers (if using Option B)
9. Open a second test PR
10. Verify workflow redeploys and restarts staging environment

---

## Security Checklist

- [x] Single stable staging URL reduces redirect URI attack surface
- [x] Manually registered redirect URI (same pattern as production)
- [x] No cross-tenant automation dependencies
- [x] No unauthenticated access to staging (MSAL enforced)
- [x] Backend Easy Auth remains disabled (Express JWT validation only)
- [x] Staging database isolated from production
- [x] PR comments clearly state shared environment behavior
- [x] Cleanup workflow prevents runaway costs (stops containers when PR closed)

---

## Alternatives Not Chosen

**Option 2 (Skip Auth):** Rejected due to false security posture — staging would rely on a single frontend check to prevent unauthenticated access. No defense in depth.

**Option 3 (New App Registration):** Rejected due to high complexity for minimal benefit when only one PR is active at a time. Over-engineered for team size.

---

## Migration Notes

- Existing per-PR resources will be orphaned (not deleted) by this change
- Run manual cleanup after migration: `az resource list -g rg-teamskills-staging --query "[?tags.\"pr-number\"].id" -o tsv | xargs -L1 az resource delete --ids`
- First deploy after migration will create the shared staging environment
- Eric must add the redirect URI manually before the first PR deploys (step 4 above)

---

## Questions for Eric

1. Are there any PRs currently using staging? (If yes, coordinate migration timing)
2. Preference for cleanup workflow: stop containers (Option B) or keep them running (Option A)?
3. Do you want staging to persist long-term, or should we delete all resources on PR close?

