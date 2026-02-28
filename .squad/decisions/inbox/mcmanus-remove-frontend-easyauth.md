# Remove Easy Auth from Frontend Container Apps

**Author:** McManus (DevOps)
**Date:** 2025-07-24

## Context
The staging deployment had a double-login issue. Easy Auth was configured on both the frontend and backend Container Apps. The frontend Easy Auth (`RedirectToLoginPage`) forced a Microsoft login before the React SPA could load. Once loaded, the React app's MSAL code required a second Microsoft login. Users had to authenticate twice to get in.

The frontend is a SPA serving static files — no sensitive data at the infrastructure level. Authentication should be handled by MSAL in the React app, not by Azure Easy Auth on the container.

## Decision
Remove the `frontendAuth` (`Microsoft.App/containerApps/authConfigs`) resource from:
- `infra/staging/main.bicep` (staging/PR environments)
- `infra/app/frontend.bicep` (production)

Keep the `backendAuth` resource on the backend Container App unchanged — the API must remain protected at the infrastructure level.

## Rationale
- Easy Auth on the frontend is redundant when MSAL handles auth in the SPA
- Double-login is a poor user experience
- The frontend serves static assets (HTML/JS/CSS) — no secrets or sensitive data
- Backend Easy Auth stays to enforce API protection with `Return401` for unauthenticated requests
- Minimal change: only the `frontendAuth` resource blocks are removed

## Consequences
- Users will no longer be prompted to login before the React app loads
- MSAL in the React app remains the single authentication mechanism for users
- Backend API remains protected by Easy Auth (unchanged)
- The `azureAdClientSecret` secret and related params on the frontend container app are now unused but harmless; can be cleaned up in a follow-up
