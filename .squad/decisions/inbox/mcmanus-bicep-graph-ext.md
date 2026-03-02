# Staging Auth via Bicep Microsoft Graph Extension

**Author:** McManus (DevOps)  
**Date:** 2026-03-03  
**Status:** Implemented

## Context

PR staging environments needed Entra ID app registrations to enable MSAL authentication. The original approach (inherited from early prototypes) attempted to register redirect URIs on a pre-existing Entra ID app in the Microsoft corp tenant (`72f988bf`).

**Critical blocker:** The CI/CD service principal had ZERO permissions in that tenant — not even basic read access. Every `az ad app update` call failed with 403. The team has no admin access to request permissions there.

This created a catch-22: staging environments deployed successfully but authentication didn't work because the redirect URIs weren't registered on the app.

## Decision

**Manage staging app registrations entirely via Bicep using the `Microsoft.Graph/applications` extension.**

Each PR creates a dedicated, ephemeral app registration with per-PR naming (`Team Skills Tracker (Staging PR${prNumber})`). The app registration is provisioned alongside the Azure infrastructure and deleted when the PR closes.

### Technical Implementation

1. **`bicepconfig.json`** — Registers the Microsoft Graph Bicep extension (v1.0, preview 0.1.8-preview)
2. **`infra/staging/main.bicep`** — Declares `Microsoft.Graph/applications` resource with:
   - SPA redirect URI pointing to the dynamically-provisioned frontend FQDN
   - OAuth2 permission scope `access_as_user` for backend API access
   - Outputs `stagingApp.appId` for workflow consumption
3. **`.github/workflows/pr-staging.yml`** — Post-deploy step sets Application ID URI (`api://${stagingAppId}`) for API scope exposure
4. **`.github/workflows/pr-cleanup.yml`** — Deletes the app registration by display name pattern when PR closes

### Removed Complexity

- Cross-tenant authentication steps (3 deleted from staging, 3 from cleanup)
- Redirect URI juggling on a shared app (risk of URI pollution across PRs)
- Manual permission requests to tenant admins
- Hardcoded app ID dependencies (`azureAdClientId` param)

## Rationale

**Why not request permissions in the resource tenant?**  
The resource tenant (`9c74def4`) already grants the CI/CD SP the required `Application.ReadWrite.OwnedBy` permission. Using Bicep declarative IaC is cleaner than imperative `az ad` commands and ensures state consistency.

**Why per-PR apps instead of a shared app?**  
- **Isolation:** Each PR gets its own app ID — no risk of scope/URI conflicts
- **Security:** PR close deletes the app immediately, not just the redirect URI
- **Auditability:** App display name directly correlates to PR number
- **Cleanup:** No orphaned redirect URIs on a shared app if cleanup jobs fail

**Why not use Terraform AzureAD provider?**  
The project uses Bicep for all IaC. Adding Terraform would split tooling for no gain. The Bicep Microsoft Graph extension provides parity with Terraform's `azuread_application` resource.

## Consequences

### Positive
- **Zero manual steps** — app registration lifecycle 100% automated
- **No cross-tenant failures** — CI/CD operates in ONE tenant with known permissions
- **IaC-native** — app registration is code, versioned, reviewable
- **Clean state** — PR close = complete resource deletion (infra + app)

### Neutral
- **Bicep extension dependency** — Requires `bicepconfig.json` in repo root; currently in preview but stable
- **Different pattern than production** — Production uses a pre-existing app (app ID `69c41897`) because it's in the locked-down corp tenant; staging can't

### Negative
- **One extra step in workflow** — Setting Application ID URI (`api://${stagingAppId}`) must happen post-deploy via `az ad app update` because Bicep doesn't support `identifierUris` on `Microsoft.Graph/applications@v1.0` yet. This is a known limitation of the extension preview.

## Alternatives Considered

1. **Request Entra ID admin permissions in corp tenant** — Rejected: permanent blocker, no political path to approval
2. **Manual app creation + hardcoded app IDs** — Rejected: doesn't scale, fragile, defeats IaC benefits
3. **Use production app for staging** — Rejected: redirect URI pollution, no isolation, cleanup complexity
4. **Skip auth in staging entirely** — Rejected: misses critical integration testing (MSAL flows, token validation)

## Follow-up

- **Production:** Continue using pre-existing app ID `69c41897` — no change needed
- **Extension maturity:** Monitor Bicep Microsoft Graph extension for GA release; watch for `identifierUris` support to eliminate post-deploy `az ad` step
- **Documentation:** Update `docs/staging-environment.md` to reflect new pattern
