# SharePoint Sync Path — Technical Analysis & Recommendation

**Author:** Keaton (Lead/Architect)  
**Date:** 2026-07-15  
**Status:** Recommendation — awaiting Eric's decision  
**Requested by:** Eric Hansen

---

## Problem Statement

The app needs to pull skill data directly from the SharePoint list at:  
`https://microsoft.sharepoint.com/teams/SDPAccountsShared/Lists/Skills%20Matrix%20MVP/AllItems.aspx`

Current state: `backend/services/sharepoint.js` has Graph API code but returns **501** because no Graph client is configured. Production data came via one-time CSV import.

---

## What the Code Actually Needs

`fetchFromSharePoint(graphClient)` in `sharepoint.js` (line 76) expects a pre-configured `@microsoft/microsoft-graph-client` instance with `Sites.Read.All` delegated permission. The admin route (`/api/admin/sync-skills` in `admin.js` line 617) returns 501 for `source: 'sharepoint'` because it never constructs this Graph client.

The error message references env vars `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_TENANT_ID` — but these don't exist anywhere in the codebase and were aspirational. They imply a **client credentials (application permissions)** flow, which is fundamentally blocked by our tenant constraints.

---

## Paths Analyzed

### ❌ Path 1: Application Permissions (Client Credentials) — BLOCKED

The existing code's implied approach. Would require:
- An app registration with `Sites.Read.All` **application** permission
- Admin consent in the Microsoft corp tenant (72f988bf)
- **Verdict:** Dead on arrival. We have zero admin access in the corp tenant. The `SHAREPOINT_CLIENT_ID` / `SHAREPOINT_CLIENT_SECRET` env vars can never be populated for this purpose.

### ❌ Path 2: Delegated Permissions via MSAL — BLOCKED

Could the frontend acquire a Graph API token with `Sites.Read.All` on behalf of the signed-in user (Eric)?

**Analysis:**
- `Sites.Read.All` delegated permission **requires admin consent** (confirmed — this was reclassified as high-impact in July 2025)
- Even if app registration `69c41897` (in corp tenant) had this permission declared, admin consent must be granted by a corp tenant admin
- We cannot modify app `69c41897`, and we cannot request admin consent in tenant `72f988bf`
- **Verdict:** Blocked by the same tenant constraint

### ❌ Path 3: SharePoint REST API — BLOCKED (same auth)

Using `/_api/web/lists/getbytitle('Skills Matrix MVP')/items` directly instead of Graph API.

**Analysis:**
- SharePoint REST API requires an OAuth token for `https://microsoft.sharepoint.com` resource
- Same consent requirements apply — needs permissions on an app registration in the corp tenant
- **Verdict:** Different API, identical auth problem

### ❌ Path 4: On-Behalf-Of (OBO) Flow — BLOCKED

Backend exchanges user's token for a Graph API token.

**Analysis:**
- OBO requires a confidential client (client secret/certificate) for the app registration
- App `69c41897` is in corp tenant — we can't add secrets to it
- Our app `9d8d893b` in tenant `9c74def4` is a different app — OBO is per-app
- **Verdict:** Blocked

### ❌ Path 5: New App Registration in Our Tenant — BLOCKED for SharePoint

We could create a new app in tenant `9c74def4`, but:
- For a multi-tenant app to access SharePoint in corp tenant, admin consent for `Sites.Read.All` must be granted **in the corp tenant**
- We can't do that
- **Verdict:** Blocked

### ⚠️ Path 6: Quick Test — Check if Permissions Already Exist

**Zero-risk, 5-minute test Eric can run.** Even though we can't modify app `69c41897`, it's possible someone already added `Sites.Read.All` delegated permission to it (e.g., for another feature). If admin consent was already granted, delegated auth would just work.

**How to test (browser console while logged into the app):**
```javascript
// Get the MSAL instance (React exposes it)
const accounts = msalInstance.getAllAccounts();
try {
  const result = await msalInstance.acquireTokenSilent({
    scopes: ['https://graph.microsoft.com/Sites.Read.All'],
    account: accounts[0]
  });
  console.log('SUCCESS — token acquired:', result.accessToken.substring(0, 50) + '...');
  // If this works, Path 2 is viable!
} catch (error) {
  console.log('BLOCKED:', error.errorCode, error.errorMessage);
  // Expected: AADSTS65001 (permission not granted) or interaction_required
}
```

If this succeeds → skip to Implementation Option A below.  
If it fails → Power Automate (Option B) is the path.

### ✅ Path 7: Power Automate Sync Bridge — RECOMMENDED

**This is the only path that avoids ALL tenant constraints.**

Power Automate flows run under Eric's identity. Eric has access to the SharePoint site. The SharePoint connector in Power Automate uses Eric's connection — no app registration permissions needed, no admin consent needed, no cross-tenant issues.

---

## Recommended Implementation

### Option A: Delegated Auth (only if Path 6 test succeeds)

If the test shows the app already has `Sites.Read.All` consent:

1. **Frontend:** Add a "Sync from SharePoint" button (admin panel only)
2. **Frontend:** Acquire a Graph API token: `acquireTokenSilent({ scopes: ['https://graph.microsoft.com/Sites.Read.All'] })`
3. **Frontend:** Pass the Graph token to a new backend endpoint
4. **Backend:** New endpoint `/api/admin/sync-sharepoint` accepts the user's Graph token
5. **Backend:** Creates a Graph client with the provided token, calls existing `fetchFromSharePoint()`
6. **Backend:** Syncs to database via existing `syncToDatabase()`

**Effort:** ~1-2 days  
**Risk:** Depends on permissions we don't control — could break if corp tenant changes policies

### Option B: Power Automate Bridge (RECOMMENDED regardless)

**Phase 1 — Backend changes (~2 hours):**

Modify `/api/admin/sync-skills` to accept a third source: `'api'` (direct records POST).

```javascript
// In admin.js, modify the sync-skills endpoint:
if (source === 'api') {
  if (!req.body.records || !Array.isArray(req.body.records)) {
    return res.status(400).json({ error: 'records array required for api source' });
  }
  records = req.body.records;
}
```

The endpoint accepts:
```json
{
  "secret": "<INIT_SECRET>",
  "source": "api",
  "records": [
    {
      "Role": "Apps & AI",
      "Category": "Agentic AI",
      "Product/Skill": "Azure AI Foundry",
      "Short Description": "Unified platform for building AI applications",
      "Core": "Yes",
      "Docs Link": "https://learn.microsoft.com/..."
    }
  ]
}
```

**Phase 2 — Power Automate flow (Eric creates, ~30 minutes):**

1. **Trigger:** Recurrence (weekly) or Manual button
2. **Action:** SharePoint → Get Items
   - Site: `https://microsoft.sharepoint.com/teams/SDPAccountsShared`
   - List: `Skills Matrix MVP`
   - Top Count: 500 (or use pagination)
3. **Action:** Select (transform SharePoint columns to expected format)
   - Map `Title`/`Role` → `Role`
   - Map `Category` → `Category`
   - Map `Product_x002f_Skill` → `Product/Skill`
   - Map `Short_x0020_Description` → `Short Description`
   - Map `Core` → `Core`
   - Map `Docs_x0020_Link` → `Docs Link`
4. **Action:** HTTP POST
   - URL: `https://ca-backend-gvojq4dgzbtk4.greenwater-c5983efd.centralus.azurecontainerapps.io/api/admin/sync-skills`
   - Body: `{ "secret": "<INIT_SECRET>", "source": "api", "records": <Select output> }`
   - Headers: `Content-Type: application/json`

**Effort:** Backend ~2 hours, Flow ~30 minutes  
**Risk:** Low — uses only capabilities Eric already has  
**Maintenance:** Flow runs under Eric's connection. If Eric's account changes, reconnect.

### Option C: Hybrid (Both A + B)

Implement both. Option B provides scheduled background sync. Option A (if test passes) provides on-demand sync from the admin UI for immediate updates.

---

## What's Fundamentally Blocked

1. **Any approach requiring admin consent in Microsoft corp tenant** — permanent constraint
2. **Client credentials / application permissions** for cross-tenant SharePoint — requires target tenant admin approval
3. **Modifying app registration `69c41897`** — we have no access
4. **Direct browser-to-SharePoint API calls** — CORS blocks this without app registration configuration in the SharePoint tenant

## What Eric Needs to Do

For **Option B** (recommended):
1. Verify the `INIT_SECRET` value for the backend (needed for the flow's HTTP action)
2. Create the Power Automate flow (3-4 steps, ~30 minutes)
3. Test with a manual run
4. Set the schedule (weekly recommended — skill lists don't change frequently)

For the **Path 6 test** (optional, 5 minutes):
1. Open the production app in browser
2. Sign in normally
3. Open browser console (F12)
4. Run the test script above
5. Report whether it succeeded or failed

---

## Env Vars Summary

The existing `SHAREPOINT_CLIENT_ID`, `SHAREPOINT_CLIENT_SECRET`, `SHAREPOINT_TENANT_ID` references in the code are **dead code** — they were designed for a client credentials flow that is permanently blocked. They should be removed or replaced.

For Option B, no new env vars are needed — the existing `INIT_SECRET` is sufficient.

For Option A (if viable), no new env vars needed — the Graph token comes from the user's browser session.
