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
- **Profile fetch timeout**: `useAuth.js` now uses AbortController with 60s timeout on `/api/auth/me` to prevent infinite hangs when backend is slow (DB waking from auto-pause) or dead (crash). Timeout MUST be ≥45-60s to accommodate Azure Flex Server wake time. Progressive loading messages at 10s and 30s thresholds provide user feedback before timeout.
- **Wake function wiring**: `VITE_WAKE_FUNCTION_URL` was missing from `docker-entrypoint.sh` config injection. Added to expose wake-function URI to frontend. Wake function checks DB status and starts it if stopped, but App.jsx already calls `useDatabaseWake` before authentication.
- **apiFetch signal support**: `apiFetch()` wrapper already supports `signal` option for AbortController integration — no changes needed to API layer.
- **Graph level filter**: `SkillGraph.jsx` now has `activeLevels` state (default `['L400']`) that filters links and hides orphan skill nodes at the data level before D3 rendering. The graph data builder (`useEffect` on `rawData, skillViewBy, activeLevels`) filters both skill-view and group-view links. Orphan removal uses a `connectedSkillIds` Set built from filtered links. The level toggle buttons use color-coded CSS classes (`.level-L400` green, `.level-L300` blue, `.level-L200` orange, `.level-L100` red) matching the proficiency badge colors elsewhere in the app.
- **Proficiency colors/descriptions are single-sourced from `ProficiencyBadge.jsx`**: `PROFICIENCY_CONFIG` holds labels, descriptions, and Fluent UI colors. A derived `LEVEL_COLORS` export provides a chart-friendly `{L100: '#d13438', L200: '#ca5010', L300: '#0078d4', L400: '#107c10'}` lookup. CoverageDashboard and any future chart component should import `LEVEL_COLORS` from ProficiencyBadge rather than defining local palettes. Descriptions are adapted from the Microsoft L100–L400 taxonomy (CSU Tech Intensity Skill Proficiency Standards, internal SharePoint).
- **Graph proficiency level filter:** Added proficiency level filter to graph view defaulting to L400-only. Users can toggle L300/L200/L100 individually. Skill nodes with no visible connections auto-hide before D3 rendering (not CSS hiding — cleaner force simulation).
