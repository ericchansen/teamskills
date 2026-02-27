# Decisions

_Team decisions are recorded here. Append-only._

---

## Production Auth Enforcement

### Enforce Auth in Production Backend

**By:** Fenster (Backend Dev)  
**Date:** 2026-02-27

**Context**  
The `requireAuth` middleware previously allowed unauthenticated access (demo mode) whenever Entra ID env vars were not set — regardless of environment. This created a risk of deploying to production without auth.

**Decision**  
When `NODE_ENV=production` and auth is not configured, `requireAuth` now returns **503 Service Unavailable** instead of passing through. Demo mode is preserved for non-production environments.

**Rationale**
- 503 (not 401/403) signals a server misconfiguration, not a client auth failure
- Health and auth-config endpoints remain accessible for monitoring and client bootstrap
- Minimal change (3 lines) with no refactoring of other middleware

**Impact**
- Backend deployments to production MUST have `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` set
- No impact on local development or test environments

---

### Skip Staging Deploy for Dependabot PRs

**Author:** McManus (DevOps)  
**Date:** 2026-02-27

**Context**  
Dependabot PRs (dependency bumps) trigger the full PR staging deploy pipeline, which provisions Azure Container Apps, PostgreSQL, and ACR image builds. This is expensive and unnecessary for automated dependency updates.

**Decision**  
Added `if: github.actor != 'dependabot[bot]'` to the `deploy-staging` job in `pr-staging.yml`. Dependabot PRs will still trigger lint/test jobs if they are added in the future, but skip the costly infrastructure deployment.

**Consequences**
- Reduced Azure costs from unnecessary staging environments on dependency bumps
- Dependabot PRs won't get staging preview URLs in PR comments
- If staging validation is needed for a dependency change, it can be triggered manually

---

### Gate Demo Login to Localhost Only

**Author:** Verbal (Frontend Dev)  
**Date:** 2026-02-27

**Context**  
The demo user dropdown allowed anyone to impersonate any user without authentication when auth env vars were missing — including on deployed instances.

**Decision**  
Demo mode is now restricted to `localhost` / `127.0.0.1` only. Deployed instances without auth configuration show a "contact your administrator" error. Detection uses `window.location.hostname`.

**Impact**
- **Local dev:** No change — demo dropdown still works.
- **Deployed (no auth):** Users see an error message instead of a user picker. No unauthenticated access.
- **Deployed (with auth):** No change — MSAL login flow as before.
