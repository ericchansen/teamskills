# Verbal — History

## Project Context
- **Project:** Team Skills Tracker — React + Vite frontend
- **User:** Eric Hansen
- **Auth:** MSAL browser (`@azure/msal-browser`, `@azure/msal-react`) with loginRedirect flow (NOT popup — known MSAL 5.x bug)
- **Config:** Runtime config injection via `docker-entrypoint.sh` → `/config.js` → `getConfig()` from `frontend/src/config.js`
- **Key files:** `frontend/src/`, `frontend/src/authConfig.js`, `frontend/src/config.js`, `frontend/src/api.js`
- **Env vars needed on frontend container:** VITE_API_URL, VITE_AZURE_AD_CLIENT_ID, VITE_AZURE_AD_TENANT_ID

## Learnings
- Demo mode (unauthenticated user picker) is now gated behind `isLocalDev` check (`window.location.hostname === 'localhost' || '127.0.0.1'`). Deployed instances without auth config show a "contact your administrator" error instead of a user dropdown. This prevents unauthorized access in production when auth env vars are missing.
- MSAL authority changed from hardcoded `'organizations'` to tenant-specific: `\`https://login.microsoftonline.com/${getConfig('VITE_AZURE_AD_TENANT_ID') || 'organizations'}\``. When `VITE_AZURE_AD_TENANT_ID` is set (deployed environments), users are sent directly to the correct tenant (no picker). Local dev without the env var still works with `'organizations'` fallback.
