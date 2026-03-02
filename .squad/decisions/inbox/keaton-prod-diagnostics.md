# Production Diagnostic Report — 2026-03-02

**Investigator:** Keaton (Lead)  
**Requested by:** Eric Hansen  
**Site:** https://ca-frontend-teamskills.greenwater-c5983efd.centralus.azurecontainerapps.io/

---

## Executive Summary

The "Loading profile" hang is caused by Azure PostgreSQL auto-pausing combined with missing connection timeouts in the backend's database pool. When the DB is paused, every API request hangs for 1-2 minutes waiting for a TCP connection that will never come. The data is real (from the SharePoint Skills Matrix CSV), but live SharePoint API sync is not yet configured.

---

## Issue 1: "Loading your profile..." Hangs

### What Users See
1. Site loads → MSAL login redirect → login succeeds
2. "Loading your profile..." spinner appears
3. Hangs for 1-2+ minutes
4. Eventually shows "Unable to load your profile. Please try again." with Retry/Sign out buttons

### Root Cause Chain
1. **Azure PostgreSQL Flexible Server auto-pauses** when idle (cost optimization)
2. Frontend calls `GET /api/auth/me` and `GET /api/users` with Bearer token
3. Backend Easy Auth passes (token valid)
4. Express `requireAuth` middleware validates JWT ✅
5. `findOrCreateUser()` calls `db.query('SELECT * FROM users WHERE entra_oid = $1')` 
6. **`backend/db.js` has NO `connectionTimeoutMillis`** — pg Pool default is `0` (wait forever)
7. TCP connection attempt to `20.29.99.102:5432` hangs until OS-level TCP timeout (~2 min)
8. Eventually: `connect ETIMEDOUT 20.29.99.102:5432`
9. `requireAuth` catch block returns 500: `{ error: 'Failed to load user profile' }`

### Evidence
- Container logs show repeated `lookup error: connect ETIMEDOUT 20.29.99.102:5432`
- PostgreSQL server state was `Stopped` when investigated
- Both `/api/auth/me` and `/api/users` hung with no response in browser network tab
- After manually starting DB (`az postgres flexible-server start`), site loaded within seconds

### Fix Required

**Immediate (backend/db.js):**
```javascript
const pool = new Pool({
  // ... existing config ...
  connectionTimeoutMillis: 5000,    // Fail fast if DB unreachable
  statement_timeout: 10000,         // Kill queries that hang
  query_timeout: 10000,
});
```

**Short-term:** Integrate the existing `wake-function/` — frontend should call the wake endpoint when backend returns 500/timeout, or the backend should call it on pool errors.

**Long-term:** Consider disabling PostgreSQL auto-pause in production, or implement a scheduled ping to keep it alive.

---

## Issue 2: SharePoint Sync Status

### Finding: Data is REAL, Sync is MANUAL

**The data in production is real team data**, not seed/test data:
- Real team members: Almir Banjanovic, Brandon Babcock, Carl Solazzo, Elan Shudnow, Eric Hansen, Eugene Imbamba, Geraldine Caszo, Heena Ugale
- Real job titles: Sr Solution Engineer, Prin Sol Engineer, Sol Engineer Leader
- Real Azure skills with proficiency levels (L100-L400)

**How it got there:** CSV import from the SharePoint list export, via `/api/admin/sync-skills` with `source: 'csv'`.

**Live SharePoint sync is NOT working:**
- `backend/services/sharepoint.js` has the code to sync via Graph API
- But `/api/admin/sync-skills` with `source: 'sharepoint'` returns **501 Not Implemented**
- Error message: "SharePoint sync not yet configured. Use source: 'csv' or configure SHAREPOINT_CLIENT_ID."
- Required env vars not set: `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_TENANT_ID`

**Note:** The SharePoint list is in tenant `72f988bf` (Microsoft corp). Per team constraint "Zero Permissions in Microsoft Corp Tenant," configuring Graph API access to this SharePoint list may require an app registration that has `Sites.Read.All` delegated permission in that tenant — which we cannot create. CSV export/import may remain the only viable sync path.

---

## Infrastructure Status

| Resource | Name | Status |
|----------|------|--------|
| Resource Group | `rg-teamskills-prod` | Active |
| Frontend Container App | `ca-frontend-teamskills` | Running ✅ |
| Backend Container App | `ca-backend-gvojq4dgzbtk4` | Running ✅ |
| PostgreSQL Flexible Server | `psql-gvojq4dgzbtk4` | Was **Stopped** → Manually started ✅ |
| Wake Function | `wake-function/` | Code exists, deployment status unknown |

**Note:** The resource group is `rg-teamskills-prod`, NOT `rg-teamskills`. Documentation/scripts referencing `rg-teamskills` will fail.

---

## Recommended Actions

| Priority | Action | Owner |
|----------|--------|-------|
| **P0** | Add `connectionTimeoutMillis: 5000` to `db.js` Pool config | Fenster (Backend) |
| **P1** | Integrate wake-function into frontend timeout/error flow | Verbal (Frontend) + McManus (DevOps) |
| **P1** | Add DB health check to backend startup and `/api/health` | Fenster (Backend) |
| **P2** | Decide: disable PG auto-pause vs. implement keep-alive ping | Keaton (Architecture) |
| **P2** | Document that CSV sync is the current data path (not live SharePoint API) | Keaton (Lead) |
| **P3** | Evaluate SharePoint Graph API access given corp tenant constraint | Kobayashi (Auth) |
