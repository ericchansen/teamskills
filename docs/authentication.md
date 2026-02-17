# Microsoft Entra ID Authentication Setup

This guide explains how to configure Microsoft Entra ID (Azure AD) authentication for the Team Skills Tracker.

## Overview

When configured, users can sign in with their Microsoft work or personal accounts. User profiles are automatically created or linked on first login.

## Prerequisites

- Azure subscription with access to Microsoft Entra ID
- Admin access to register applications in your tenant

## Step 1: Register an Application in Entra ID

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Microsoft Entra ID** > **App registrations**
3. Click **New registration**
4. Fill in:
   - **Name**: `Team Skills Tracker` (or your preferred name)
   - **Supported account types**: Choose based on your needs:
     - *Single tenant*: Only users from your organization
     - *Multi-tenant*: Users from any Microsoft organization
     - *Personal accounts*: Include personal Microsoft accounts
   - **Redirect URI**: 
     - Platform: `Single-page application (SPA)`
     - URI: `http://localhost:3000` (for development)
5. Click **Register**

## Step 2: Note Your Application IDs

After registration, note these values from the **Overview** page:
- **Application (client) ID**: Your `AZURE_AD_CLIENT_ID`
- **Directory (tenant) ID**: Your `AZURE_AD_TENANT_ID`

## Step 3: Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph** > **Delegated permissions**
4. Add:
   - `openid` (Sign users in)
   - `profile` (View users' basic profile)
   - `email` (View users' email address)
5. Click **Add permissions**

## Step 4: Expose an API (for backend token validation)

1. Go to **Expose an API**
2. Click **Set** next to "Application ID URI"
   - Accept the default `api://<client-id>` or set a custom URI
3. Click **Add a scope**:
   - **Scope name**: `access_as_user`
   - **Who can consent**: Admins and users
   - **Admin consent display name**: `Access Team Skills as user`
   - **Admin consent description**: `Allows the app to access Team Skills API on behalf of the signed-in user`
   - **User consent display name**: `Access Team Skills`
   - **User consent description**: `Allow the app to access Team Skills on your behalf`
4. Click **Add scope**

## Step 5: Add Redirect URIs for Production

1. Go to **Authentication**
2. Under **Single-page application**, add your production URLs:
   - `https://your-frontend-url.azurecontainerapps.io`
3. Click **Save**

## Step 6: Configure Environment Variables

### Backend (.env)

```env
AZURE_AD_CLIENT_ID=your-client-id-guid
AZURE_AD_TENANT_ID=your-tenant-id-guid
```

### Frontend (.env or build args)

```env
VITE_AZURE_AD_CLIENT_ID=your-client-id-guid
VITE_AZURE_AD_TENANT_ID=your-tenant-id-guid
```

### GitHub Actions (for CI/CD)

Add these as repository variables:
- `AZURE_AD_CLIENT_ID`: Your application client ID
- `AZURE_AD_TENANT_ID`: Your tenant ID (or use existing `AZURE_TENANT_ID`)

## How It Works

### User Flow

1. User clicks "Sign in" button
2. MSAL.js opens Microsoft login popup
3. User authenticates with Microsoft
4. Frontend receives ID token and access token
5. Frontend includes access token in API requests
6. Backend validates token and finds/creates user

### User Matching

When a user logs in, the backend:
1. Looks for existing user by Entra ID object ID (`entra_oid`)
2. If not found, looks for existing user by email
3. If email match found, links the existing user to Entra ID
4. If no match, creates a new user with info from token

### Token Scopes

- **ID Token**: Contains user identity claims (name, email, oid)
- **Access Token**: Used to call backend API with scope `api://<client-id>/access_as_user`

## Protected Routes

With authentication enabled, the following routes require authentication:

| Route | Method | Auth Required | Notes |
|-------|--------|---------------|-------|
| `/api/user-skills/:id` | GET | No | Read-only access |
| `/api/user-skills` | PUT | Yes | Must be own user_id |
| `/api/user-skills` | DELETE | Yes | Must be own user_id |
| `/api/auth/me` | GET | Yes | Returns current user |
| `/api/auth/config` | GET | No | Returns auth config |

All other GET routes remain public for read access.

## Troubleshooting

### "AADSTS50011: The redirect URI does not match"

Add your app's URL to the registered redirect URIs in the Azure Portal.

### "AADSTS7000218: Request body must contain client_assertion or client_secret"

This happens with SPAs. Ensure your redirect URI is registered as "Single-page application" type, not "Web".

### User not being created on login

Check that your backend has the correct `AZURE_AD_CLIENT_ID` and `AZURE_AD_TENANT_ID` environment variables.

### Token validation fails

Verify the token issuer matches your tenant. The backend expects tokens from:
- `https://login.microsoftonline.com/{tenant-id}/v2.0`
- `https://sts.windows.net/{tenant-id}/`

## Demo Mode (No Authentication)

If `VITE_AZURE_AD_CLIENT_ID` is not set, the app falls back to demo mode with a simple user picker dropdown. This is useful for local development without setting up Entra ID.

## Database Migration

For existing deployments, run the migration to add the `entra_oid` column:

```sql
-- Run this migration script
psql -d teamskills -f database/migrations/001_add_entra_oid.sql
```

Or the column will be added automatically on next `/api/admin/init` call.
