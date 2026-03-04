# Power Automate ΓåÆ SharePoint Sync: Hard-Won Learnings

**Confidence:** high  
**Domain:** Power Automate, SharePoint Online, Azure Container Apps  
**Last updated:** 2026-03-04

---

## 1. SharePoint Connector Returns Internal Column Names, Not Display Names

**Problem:** The SharePoint "Get items" action in Power Automate returns internal column names like `field_1`, `field_2`, `field_3` ΓÇö NOT the display names like "GitHub Copilot", "Azure AI Search", etc.

**Why:** SharePoint internally creates columns with `field_N` internal names when columns are added via the UI. The display title (what humans see) is metadata, not the field key in the API response.

**Solution:** Add a second action to the PA flow using `GetTable` (operationId) which returns the list schema including a mapping of `internalName ΓåÆ title`. The schema lives at `response.schema.schema.items.properties` where each property key is the internal name and `.title` is the display name.

**Example column map entry:**
```json
{
  "field_1": {
    "title": "GitHub Copilot",
    "type": "object",
    "x-ms-capabilities": { "x-ms-sp": { "IsChoice": true } }
  }
}
```

**Backend code must:** Build a `columnMap` from the schema, then use it during transformation to map `field_1` ΓåÆ "GitHub Copilot" before storing in the database.

---

## 2. Choice Column Values Are Objects, Not Flat Values

**Problem:** SharePoint Choice columns (like proficiency levels 100/200/300/400) are returned as nested objects, not flat numbers or strings.

**What you expect:** `{ "field_1": 400 }`  
**What you get:** `{ "field_1": { "@odata.type": "#Microsoft.Azure.Connectors.SharePoint.SPListExpandedReference", "Id": 3, "Value": "400" } }`

**Solution:** Extract `.Value` from object-typed fields. Write a helper like:
```javascript
function extractStringValue(raw) {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'object' && raw.Value !== undefined) return String(raw.Value).trim();
  return '';
}
```

**Also applies to:** The "Qualifier" column (renamed `Your_x0020_Qualifier` internally), User/Person columns (`Your_x0020_Name`), and any Lookup column.

---

## 3. Companion `#Id` Fields Must Be Filtered

**Problem:** For every Choice/Lookup column, SharePoint returns a companion field with `#Id` suffix (e.g., `field_1#Id`, `Your_x0020_Qualifier#Id`). These are numeric IDs for the choice option, not skill data.

**Solution:** Skip any field key containing `#` during skill discovery:
```javascript
if (key.includes('#')) continue;
```

---

## 4. DLP Policy Blocks `HttpRequest` (Send HTTP Request to SharePoint)

**Problem:** Microsoft's tenant-level Data Loss Prevention policy ("Personal Developer (default)") blocks the `HttpRequestReceived` / `HttpRequest` API in Power Automate. If you add an action using `operationId: "HttpRequest"` (Send an HTTP request to SharePoint), the flow will be **immediately suspended** and you'll get an email notification.

**What triggers it:** The `HttpRequest` operation is classified as a premium/sensitive connector action. The DLP policy restricts it in the default environment.

**What works instead:** Use standard SharePoint connector actions that are NOT blocked:
- `GetItems` ΓÇö Get items from a list Γ£à
- `GetTable` ΓÇö Get list metadata/schema Γ£à
- `PatchItem` ΓÇö Update a list item Γ£à
- Other standard ops Γ£à

**Key lesson:** Never use `operationId: "HttpRequest"` in a Power Automate flow on a corporate Microsoft tenant. Use the built-in connector operations instead.

---

## 5. PA Flows Auto-Suspend and Must Be Re-Enabled

**Problem:** Newly created flows start in `Suspended` or `Stopped` state. Flows also auto-suspend after a period of inactivity or after DLP violations.

**Solution:** After creating or modifying a flow, always call the `/start` endpoint:
```
POST https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple/environments/{envId}/flows/{flowId}/start?api-version=2016-11-01
Authorization: Bearer {token from https://service.flow.microsoft.com}
```

**Staging implication:** The PR staging deploy workflow should include a step to re-enable flows if they've been suspended.

---

## 6. PA HTTP Manual Triggers ONLY Accept POST

**Problem:** Power Automate HTTP manual triggers reject GET requests with error `TriggerRequestMethodNotValid: expected 'POST' and actual 'GET'`.

**Solution:** Even for "pull" operations that are logically reads, the HTTP trigger requires `method: 'POST'` with a JSON body (can be empty `{}`).

---

## 7. PA Flow Definition Format Differs from Logic Apps

**Key differences from Azure Logic Apps:**
- PA uses `OpenApiConnection` type, NOT `ApiConnection`
- Actions use `host.apiId`, `host.operationId`, `host.connectionName`
- Must include `$authentication` parameter: `{ "defaultValue": {}, "type": "SecureObject" }`
- SharePoint Update item operationId is `PatchItem` (not `patch`)

**Connection references must be included in PATCH updates:**
```json
{
  "properties": {
    "definition": { "..." },
    "connectionReferences": {
      "shared_sharepointonline": {
        "connectionName": "shared-sharepointonl-{guid}",
        "source": "Embedded",
        "id": "/providers/Microsoft.PowerApps/apis/shared_sharepointonline"
      }
    }
  }
}
```

If you omit `connectionReferences` in a PATCH, you'll get: `WorkflowRunActionInputsMissingProperty: 'host.connectionReferenceName' is missing`.

---

## 8. SAS vs Tenant Auth for PA Trigger URLs

**Two authentication modes for PA HTTP triggers:**

| Mode | Config | Callback URL | How to call |
|------|--------|-------------|-------------|
| **SAS** (default) | No `triggerAuthenticationType` | Contains `sig=...` parameter | Plain HTTP, no auth header needed |
| **Tenant** | `triggerAuthenticationType: "Tenant"` | No `sig` parameter | Requires `Authorization: Bearer {token}` header |

**For backend-to-PA calls without auth headers:** Use SAS mode (omit `triggerAuthenticationType` from the trigger definition).

---

## 9. Junk Data Cleanup After Schema Fixes

**Problem:** If the backend ran with buggy transform logic (before column mapping was fixed), the database will contain:
- Hundreds of skills named `field_1`, `field_2`, ..., `field_N`, `field_N#Id`
- Skills named `Your_x0020_Name`, `Your_x0020_Qualifier`, `ItemInternalId`
- Duplicate skills with the same display name (from both admin/init seeding and SharePoint pull)
- Zero `user_skills` records (because values couldn't be parsed from objects)

**Solution:** Add cleanup SQL to the pull route:
```sql
-- Remove internal field name skills
DELETE FROM skills WHERE name ~ '^field_\d+(#Id)?$'
  OR name ~ '^Your_x0020_' OR name = 'ItemInternalId';

-- Deduplicate same-name skills (keep lowest ID)
DELETE FROM skills WHERE id NOT IN (
  SELECT MIN(id) FROM skills GROUP BY name
);
```

Run this BEFORE `syncPivotToDatabase()` so the sync can create fresh, correctly-named skills.

---

## 10. PostgreSQL Flexible Server Auto-Stop

**Problem:** Azure PostgreSQL Flexible Server on burstable tier (Standard_B1ms) auto-stops after extended inactivity, causing `Database connection failed` errors.

**Solution:** The PR staging deploy workflow includes a "Wake up Postgres if stopped" step that checks server state and starts it if needed. If the database goes down between deploys, re-run the staging workflow: `gh run rerun {runId}`.

**RBAC note:** Individual user accounts may not have RBAC on staging resources. The GitHub Actions service principal has access. Use `gh run rerun` as a workaround.

---

## 11. Power Automate REST API Reference

| Operation | Method | URL |
|-----------|--------|-----|
| Get flow | GET | `.../environments/{envId}/flows/{flowId}?api-version=2016-11-01` |
| Create flow | POST | `.../environments/{envId}/flows?api-version=2016-11-01` |
| Update flow | PATCH | `.../environments/{envId}/flows/{flowId}?api-version=2016-11-01` |
| Start flow | POST | `.../environments/{envId}/flows/{flowId}/start?api-version=2016-11-01` |
| Get trigger URL | POST | `.../environments/{envId}/flows/{flowId}/triggers/manual/listCallbackUrl?api-version=2016-11-01` |

**Base:** `https://api.flow.microsoft.com/providers/Microsoft.ProcessSimple`  
**Token resource:** `https://service.flow.microsoft.com`  
**Get token:** `az account get-access-token --resource "https://service.flow.microsoft.com" --query accessToken -o tsv`

---

## 12. Response Format: Combined Items + Schema

The updated PA Pull flow returns both items and schema in a single response:

```json
{
  "items": [ "/* SharePoint list items with internal field names */" ],
  "schema": {
    "name": "Skills Matrix MVP",
    "schema": {
      "type": "array",
      "items": {
        "properties": {
          "field_1": { "title": "GitHub Copilot", "type": "object" },
          "field_2": { "title": "GitHub Copilot CLI", "type": "object" }
        }
      }
    }
  }
}
```

The backend `pullFromSharePoint()` returns `{ items, columnMap }` where `columnMap` is built from the schema properties.

---

## 13. Current State of the Code (as of 2026-03-04)

### Files involved:
- `backend/services/powerAutomateSync.js` ΓÇö Core sync logic. `pullFromSharePoint()` returns `{ items, columnMap }`. `transformFlowItemsToPivotFormat(items, columnMap)` handles internalΓåÆdisplay name mapping and object value extraction.
- `backend/routes/sharepoint.js` ΓÇö Routes. Pull route includes junk skill cleanup SQL before sync.
- `backend/tests/powerAutomateSync.test.js` ΓÇö Tests for both old (flat) and new (object + columnMap) formats.

### What's deployed vs what's pending:
- The column mapping fix and junk cleanup are committed and pushed but the staging deploy may still show old junk skills until a pull is triggered after deploy completes.
- The PA Pull flow has been updated with `GetTable` action (DLP-safe) ΓÇö this is live in Power Automate.
- The PA Pull flow was previously updated with `HttpRequest` action which got DLP-suspended, then fixed to use `GetTable` and re-enabled.

### Known remaining issue:
- The staging database still contains ~292 junk `field_N` skills and ~200 duplicate display-name skills from the initial buggy pulls. The cleanup SQL runs on the next pull, so one pull after deploy will clean the database. But the skills ARE still there until that happens.
