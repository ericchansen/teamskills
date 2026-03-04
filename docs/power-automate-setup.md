# Power Automate Setup Guide — SharePoint Skills Sync

This guide walks you through creating Power Automate flows to sync skills data between the TeamSkills app and the SharePoint "Skills Matrix MVP" list.

## Prerequisites

- **Power Automate License**: Premium or per-user plan (required for HTTP triggers)
- **SharePoint Access**: Read/write permissions to the "Skills Matrix MVP" list at:
  - Site: `https://microsoft.sharepoint.com/teams/SDPAccountsShared`
  - List: `Skills Matrix MVP`
- **Permissions**: Ability to create and manage Power Automate flows in your environment

## Overview

You'll create two flows:

1. **Pull Flow** (GET): Fetches all skills data from SharePoint
2. **Push Flow** (POST): Updates a user's skills in SharePoint

## Option A: Import from JSON Definition (Recommended)

### Step 1: Download Flow Definitions

The flow definitions are in the `flow-templates/` directory:
- `pull-flow-definition.json`
- `push-flow-definition.json`

### Step 2: Import Pull Flow

1. Go to [Power Automate](https://make.powerautomate.com)
2. Click **My flows** → **Import** → **Import Package (Legacy)**
3. Upload `pull-flow-definition.json`
4. Click **Import**
5. Power Automate will prompt you to configure the SharePoint connection:
   - Click **Select during import** under Connections
   - Choose an existing SharePoint connection or create a new one
   - Click **Save**
6. Click **Import** again to complete the import
7. After import, open the flow and click **Edit**
8. Verify the SharePoint site and list name are correct:
   - Site: `https://microsoft.sharepoint.com/teams/SDPAccountsShared`
   - List: `Skills Matrix MVP`
9. Click **Save**

### Step 3: Import Push Flow

Repeat Step 2 for `push-flow-definition.json`.

### Step 4: Get Flow URLs

1. Open the **Pull Flow**
2. Click on the **When a HTTP request is received** trigger
3. After saving the flow at least once, the **HTTP POST URL** will appear
4. Copy this URL — this is your `SHAREPOINT_PULL_FLOW_URL`
5. Repeat for the **Push Flow** to get `SHAREPOINT_PUSH_FLOW_URL`

**Note**: The URL won't appear until you save the flow at least once.

## Option B: Manual Creation

### Creating the Pull Flow

1. Go to [Power Automate](https://make.powerautomate.com)
2. Click **Create** → **Automated cloud flow**
3. Name: `SharePoint Skills Pull`
4. Skip trigger selection, click **Create**

#### Configure Trigger

1. Click **Add a trigger**
2. Search for "When a HTTP request is received"
3. Select it
4. Set **Method**: `GET`
5. Leave schema empty (not needed for GET)

#### Add SharePoint Get Items Action

1. Click **New step**
2. Search for "SharePoint - Get items"
3. Configure:
   - **Site Address**: `https://microsoft.sharepoint.com/teams/SDPAccountsShared`
   - **List Name**: `Skills Matrix MVP`
   - Leave other fields default

#### Add Response Action

1. Click **New step**
2. Search for "Response"
3. Configure:
   - **Status Code**: `200`
   - **Headers**: Add `Content-Type` = `application/json`
   - **Body**: Click in the field, then select **Body** from the "Get items" dynamic content

#### Save and Get URL

1. Click **Save**
2. Click back into the trigger "When a HTTP request is received"
3. Copy the **HTTP GET URL** that appears
4. This is your `SHAREPOINT_PULL_FLOW_URL`

### Creating the Push Flow

1. Create a new flow: **Create** → **Automated cloud flow**
2. Name: `SharePoint Skills Push`
3. Skip trigger selection, click **Create**

#### Configure Trigger

1. Click **Add a trigger**
2. Search for "When a HTTP request is received"
3. Select it
4. Set **Method**: `POST`
5. Set **Request Body JSON Schema**:
```json
{
  "type": "object",
  "properties": {
    "userName": {
      "type": "string"
    },
    "fields": {
      "type": "object"
    }
  },
  "required": [
    "userName",
    "fields"
  ]
}
```

#### Add Get Items (Filtered) Action

1. Click **New step**
2. Search for "SharePoint - Get items"
3. Configure:
   - **Site Address**: `https://microsoft.sharepoint.com/teams/SDPAccountsShared`
   - **List Name**: `Skills Matrix MVP`
   - Click **Show advanced options**
   - **Filter Query**: `Title eq '@{triggerBody()?['userName']}'`

#### Add Condition

1. Click **New step**
2. Search for "Condition"
3. Configure the condition:
   - Click in the first box
   - Add expression: `length(body('Get_items')?['value'])`
   - Operator: `is greater than`
   - Value: `0`

#### Configure "If yes" Branch

1. Click **Add an action** under "If yes"
2. Search for "SharePoint - Update item"
3. Configure:
   - **Site Address**: `https://microsoft.sharepoint.com/teams/SDPAccountsShared`
   - **List Name**: `Skills Matrix MVP`
   - **Id**: Add expression: `first(body('Get_items')?['value'])?['ID']`
   - For each skill field you want to update, add it manually (e.g., "GitHub Copilot", "Azure OpenAI")
   - For the value, use: `triggerBody()?['fields']?['GitHub Copilot']` (replace field name)

**Note**: SharePoint Update Item requires explicit field mapping. For dynamic fields, you may need to use the SharePoint REST API action instead or pre-define all skill columns.

4. Add **Response** action after Update Item:
   - **Status Code**: `200`
   - **Headers**: Add `Content-Type` = `application/json`
   - **Body**:
```json
{
  "success": true
}
```

#### Configure "If no" Branch

1. Click **Add an action** under "If no"
2. Search for "Response"
3. Configure:
   - **Status Code**: `404`
   - **Headers**: Add `Content-Type` = `application/json`
   - **Body**:
```json
{
  "success": false,
  "error": "User not found in Skills Matrix MVP list"
}
```

#### Save and Get URL

1. Click **Save**
2. Click back into the trigger
3. Copy the **HTTP POST URL**
4. This is your `SHAREPOINT_PUSH_FLOW_URL`

## Configure the TeamSkills App

### Environment Variables

Add these to your `.env` file (or Azure App Service Configuration):

```env
SHAREPOINT_SYNC_METHOD=power-automate
SHAREPOINT_PULL_FLOW_URL=https://prod-xx.westus.logic.azure.com:443/workflows/...
SHAREPOINT_PUSH_FLOW_URL=https://prod-xx.westus.logic.azure.com:443/workflows/...
```

### Restart the App

After setting environment variables, restart the app:
```bash
# Local development
npm run dev

# Azure App Service
az webapp restart --name <your-app-name> --resource-group <your-rg>
```

## Testing the Flows

### Test Pull Flow

```bash
curl -X GET "YOUR_PULL_FLOW_URL"
```

**Expected Response**: JSON array of SharePoint list items:
```json
{
  "value": [
    {
      "ID": 1,
      "Title": "Jane Doe",
      "Qualifier": "Apps & AI",
      "Alias": "janedoe@microsoft.com",
      "GitHub Copilot": 400,
      "Azure OpenAI": 300
    }
  ]
}
```

### Test Push Flow

```bash
curl -X POST "YOUR_PUSH_FLOW_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "userName": "Jane Doe",
    "fields": {
      "GitHub Copilot": 400,
      "Azure OpenAI": 300
    }
  }'
```

**Expected Response**:
```json
{
  "success": true
}
```

### Test from the App

1. Log into the TeamSkills app
2. Go to **Admin** → **Settings** → **SharePoint Sync**
3. Click **Test Pull** — should show "Pull successful"
4. Edit a skill level
5. Click **Save** — backend will call the push flow
6. Verify the update in SharePoint

## Troubleshooting

### "HTTP POST URL not showing"

**Cause**: Flow hasn't been saved yet.

**Solution**: Click **Save** in the flow, then re-open the trigger. The URL will appear.

### "Unauthorized" or "Access Denied"

**Cause**: SharePoint connection doesn't have permissions to the list.

**Solution**:
1. In the flow, click on the SharePoint action
2. Click the **...** menu → **Delete**
3. Re-add the SharePoint action
4. When prompted, sign in with an account that has access to the list
5. Save the flow

### "List 'Skills Matrix MVP' not found"

**Cause**: The list name or site URL is incorrect.

**Solution**:
1. Verify the SharePoint site URL: `https://microsoft.sharepoint.com/teams/SDPAccountsShared`
2. Verify the list name: `Skills Matrix MVP` (case-sensitive)
3. Check that you have access to the list by opening it in a browser

### Push Flow Returns 404 for Valid User

**Cause**: The `Title` column in SharePoint doesn't match the `userName` in the request.

**Solution**:
1. Check the exact value in the SharePoint `Title` column (case-sensitive)
2. Ensure the app is sending the correct display name
3. Test with the exact name from SharePoint:
```bash
curl -X POST "YOUR_PUSH_FLOW_URL" \
  -H "Content-Type: application/json" \
  -d '{"userName": "Exact Name From SharePoint", "fields": {"GitHub Copilot": 300}}'
```

### Update Item Doesn't Update Fields

**Cause**: SharePoint Update Item action requires explicit field mapping. Dynamic fields from the request body aren't automatically applied.

**Solution**:
- **Option 1**: Pre-define all skill columns in the Update Item action
- **Option 2**: Use HTTP action with SharePoint REST API instead:
  ```
  POST https://microsoft.sharepoint.com/teams/SDPAccountsShared/_api/web/lists/getbytitle('Skills Matrix MVP')/items({itemId})
  Headers: 
    - Accept: application/json;odata=verbose
    - Content-Type: application/json;odata=verbose
    - If-Match: *
    - X-HTTP-Method: MERGE
  Body: @triggerBody()?['fields']
  ```

### Flow Runs Slowly

**Cause**: Power Automate flows can have delays, especially on shared tenants.

**Solution**:
- This is expected behavior for Power Automate
- For faster sync, consider using Microsoft Graph API directly (requires app registration and authentication)
- Monitor flow run history to identify slow steps

### "Premium License Required"

**Cause**: HTTP triggers require a Power Automate Premium license.

**Solution**:
- Purchase Power Automate per-user or per-flow license
- Or switch to Graph API integration (no license required, but more complex setup)

## Next Steps

- Set up automated sync schedules (if needed)
- Monitor flow run history for errors
- Consider adding retry logic in the app for failed sync operations
- Review Power Automate usage analytics

## Resources

- [Power Automate Documentation](https://learn.microsoft.com/power-automate/)
- [SharePoint Connector Reference](https://learn.microsoft.com/connectors/sharepointonline/)
- [HTTP Trigger Documentation](https://learn.microsoft.com/power-automate/triggers-introduction#http-request-trigger)
- [TeamSkills Backend Code](../backend/services/powerAutomateSync.js)
