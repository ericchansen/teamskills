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
