# Kobayashi — History

## Project Context
- **Project:** Team Skills Tracker — Auth via Microsoft Entra ID
- **User:** Eric Hansen
- **Frontend auth:** `@azure/msal-browser` + `@azure/msal-react`, loginRedirect flow
- **Backend auth:** JWT bearer validation via `jwks-rsa`, optional (demo mode)
- **Config:** `frontend/src/authConfig.js`, `frontend/src/config.js` (runtime injection)
- **CI/CD secrets:** GitHub Environment "production" with individual secrets in JSON format
- **Staging:** Uses `environment: staging` (not production)
- **Dependabot:** Can't access GitHub Actions/Environment secrets — only Dependabot secrets

## Learnings

### 2026-03-02 — SPA Redirect URI Auto-Management for PR Staging
- **PR staging environments** deploy with dynamic FQDNs like `https://ca-frontend-pr31.redground-066e115e.centralus.azurecontainerapps.io`
- **MSAL redirectUri** correctly uses `window.location.origin` but Entra ID app registration needs pre-registered URIs
- **Fix implemented**: Added `az ad app update --set spa.redirectUris=[...]` steps to both workflows
  - `pr-staging.yml`: After deploy, add frontend URL to SPA redirect URIs using jq unique merge
  - `pr-cleanup.yml`: Before resource deletion, remove URIs matching `pr${PR_NUMBER}` pattern
- **Permissions required**: SP needs `Application.ReadWrite.OwnedBy` Graph permission OR must be listed as app owner
- **Race condition handling**: jq unique operation deduplicates if multiple PRs deploy simultaneously
- **NOT using `--web-redirect-uris`**: SPA apps require `spa.redirectUris`, not web platform URIs
- **Pattern**: `az ad app show --id $CLIENT_ID --query spa.redirectUris -o json` → jq transform → `az ad app update`

### 2026-03-02 — PR #25/#27/#28 Security Review
- **Multi-tenant JWKS** (PR #27): Switched from tenant-specific to `common` JWKS endpoint and removed issuer validation. This is correct for AzureADMultipleOrgs — audience check (`api://{clientId}`) is sufficient since only tokens minted for this app pass. JWKS cache reduced 24h→4h is good hygiene for key rotation.
- **InteractionRequiredAuthError** (PR #27): Frontend now falls back to `acquireTokenRedirect` when silent token acquisition fails. Previously swallowed the error and returned null, leaving user in a broken state.
- **Easy Auth disabled unconditionally** (PR #27): Deploying the authConfig resource unconditionally prevents stale Easy Auth config from persisting. Correct.
- **azureAdClientSecret removed** (PR #25/#27): No longer passed to Bicep. Good — backend validates JWT via JWKS (public keys), no client secret needed.
- **Demo user `is_admin: true`** (PR #28): Added to `requireAuth` and `optionalAuth` when auth not configured. Acceptable because: (1) production blocks with 503 when auth not configured, (2) frontend gates demo mode to localhost only. Not exploitable in deployment.
- **NODE_ENV=staging** (PR #28): Staging Bicep changed from `production` to `staging`, which enables demo mode passthrough. Acceptable for staging environments used for functional testing.
- **Redirect URI management removed** (PR #28): Staging/cleanup workflows no longer manage Entra ID redirect URIs. This means staging URLs won't be registered — acceptable since staging doesn't use auth.
- **`isAuthConfigured()` now only checks CLIENT_ID** (PR #27): Tenant ID no longer required for backend. Correct — backend only needs client ID for audience validation. Tenant ID is a frontend MSAL concern.
- **Remaining gap**: No rate limiting on auth endpoints. No CORS origin validation visible in auth middleware (likely handled elsewhere). No token revocation mechanism.

### 2025-03-01 — Cross-Tenant Permissions Barrier Discovery

**Context:**  
Entra app "Team Skills Tracker" (`69c41897-2a3c-4956-b78d-56670cdb5750`) lives in tenant `72f988bf` (Microsoft corp). CI/CD service principal `github-teamskills` (`9d8d893b-c810-407e-98bb-5e3b83dc056d`) lives in tenant `9c74def4` (managed env). The SP is listed as an **owner** of the app registration, but its backing app has `signInAudience: AzureADMyOrg` (single-tenant only).

**Hard Constraint:**  
Eric has **zero permissions** in tenant `72f988bf`. All manual changes must be done by Eric using his `@microsoft.com` account via Azure Portal. The SP **cannot** authenticate to `72f988bf` programmatically to run `az ad app update` commands.

**Impact:**  
- Per-PR staging deployments create dynamic URLs: `ca-frontend-pr{N}.{cae-domain}`
- Entra ID does NOT support wildcard redirect URIs for SPA apps
- `az ad app update` steps in `pr-staging.yml` and `pr-cleanup.yml` will **permanently fail**
- Production works because someone manually added the stable prod URL once

**Architecture Notes:**  
- At runtime, MSAL in the browser talks directly to Entra ID — the SP is not involved in the auth flow
- The SP is only needed for infrastructure provisioning (`az containerapp create`, `az postgres flexible-server create`, etc.)
- The SP credentials are stored in GitHub secrets (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` for resource tenant, separate `AZURE_AD_TENANT_ID` for auth tenant)
- Workflows attempted to use two separate `azure/login@v2` actions with different tenant IDs to switch tenants mid-workflow — this was a workaround that never actually worked

**Decision Made:**  
Recommended **Option 1: Stable Staging URL** (one shared `ca-frontend-staging` container app instead of per-PR isolation). Security rationale: minimal attack surface, production parity, no cross-tenant automation, acceptable trade-off for a solo dev team. See `.squad/decisions/inbox/kobayashi-staging-auth-strategy.md` for full analysis.

**Key Learnings:**  
1. **Cross-tenant service principal limitations** — a SP in tenant A cannot manage Entra apps in tenant B even if listed as owner, due to `signInAudience` restrictions on the SP's backing app
2. **SPA redirect URIs are strict** — no wildcards, no regex patterns, each URL must be pre-registered
3. **Single-tenant vs multi-tenant** — `AzureADMyOrg` means the app only works in its home tenant; changing this would require re-creating the app registration or migrating it
4. **Stable URLs reduce operational toil** — production uses a stable URL (`ca-frontend-teamskills.{domain}`) and works fine with one manual redirect URI setup; staging should follow the same pattern
5. **Per-PR isolation has a cost** — requires either (a) programmatic redirect URI management (blocked by cross-tenant barrier), (b) a separate app registration in the managed tenant (high complexity), or (c) skipping auth in staging (poor security posture)

## ⛔ CRITICAL CONSTRAINT (2026-03-02)
**ZERO PERMISSIONS in Microsoft corp tenant 72f988bf. Nobody on this team can do ANYTHING there — not programmatically, not manually, not via Portal. Eric does NOT have admin permissions. This is PERMANENT.**

Implications:
- CANNOT modify redirect URIs on the Entra app (app ID 69c41897)
- CANNOT use az ad, Bicep Microsoft.Graph, or Terraform AzureAD against this tenant
- CANNOT ask Eric to manually fix things in Portal — he doesn't have permissions either
- Option 1 (stable staging URL with manual redirect URI add) is DEAD
- Only viable staging options: (1) Skip auth in staging, (2) New app reg in tenant 9c74def4
