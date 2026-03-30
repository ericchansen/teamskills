# Microsoft Entra ID Authentication Setup

This guide explains how to configure Microsoft Entra ID (Azure AD) authentication for the Team Skills Tracker.

## Authentication Architecture

The app uses a **two-layer authentication model**:

### Layer 1: Easy Auth (Container Apps Ingress Gate)

Easy Auth is configured on the **frontend** Container App to restrict access at the ingress level. When `azureAdClientId` is provided in the Bicep parameters, Easy Auth:

- **Enables platform authentication** on the frontend Container App
- **Redirects unauthenticated users** to the Microsoft login page
- **Restricts access by tenant** — only users from the configured tenant can load the SPA
- **Excludes `/config.js`** from authentication so runtime config is always accessible before MSAL initializes

The app registration lives in the Microsoft Corp tenant (`72f988bf-86f1-41af-91ab-2d7cd011db47`), which the team uses but doesn't control. Easy Auth ensures only users from that tenant can access the app.

### Layer 2: MSAL.js + Express Middleware (API Token Validation)

Once past Easy Auth, **MSAL.js** handles API authentication:

1. MSAL.js acquires an access token client-side (via popup or redirect)
2. The frontend includes the token in API requests as a `Bearer` header
3. The backend Express middleware validates the token via JWKS with tenant enforcement
4. The backend finds or creates the user based on the token claims (`oid`, `email`, `name`)

### Auth Mode Decision

| Condition | Easy Auth | MSAL.js | Result |
|-----------|-----------|---------|--------|
| `azureAdClientId` is set | Enabled (RedirectToLoginPage) | Active | Full tenant-gated authentication |
| `azureAdClientId` is empty | Disabled (AllowAnonymous) | Inactive | Demo mode with user picker dropdown |

This is defined in [`infra/app/frontend.bicep`](../infra/app/frontend.bicep) — the `frontendAuth` resource conditionally enables Easy Auth based on whether `azureAdClientId` is provided.

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

## Step 5: Create a Client Secret (for Easy Auth)

Easy Auth requires a client secret to validate tokens at the ingress:

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description (e.g., `Easy Auth - Team Skills Frontend`)
4. Choose an expiry (recommended: 12 months)
5. Click **Add** and copy the secret value immediately
6. Pass this as the `azureAdClientSecret` parameter in your Bicep deployment

> **Note:** Store the client secret securely. For CI/CD, add it as a GitHub Actions secret.

## Step 6: Add Redirect URIs for Production

1. Go to **Authentication**
2. Under **Single-page application**, add your production URLs:
   - `https://your-frontend-url.azurecontainerapps.io`
3. Click **Save**

## Step 7: Configure Environment Variables

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

Add this as a repository secret:
- `AZURE_AD_CLIENT_SECRET`: Your client secret (for Easy Auth)

## How It Works

### User Flow

1. User visits the frontend URL
2. Easy Auth intercepts the request and redirects to Microsoft login (if enabled)
3. User authenticates with Microsoft
4. Easy Auth validates the token and allows access to the SPA
5. MSAL.js acquires an access token for the backend API
6. Frontend includes access token in API requests
7. Backend validates token and finds/creates user

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

### Easy Auth returns 401 but MSAL works locally

This is expected when Easy Auth is enabled — it gates access at the ingress before MSAL ever runs. Ensure the user is in the configured tenant.

## Demo Mode (No Authentication)

If `VITE_AZURE_AD_CLIENT_ID` is not set, the app falls back to demo mode with a simple user picker dropdown. This is useful for local development without setting up Entra ID. Easy Auth is also disabled in this mode (see [Authentication Architecture](#authentication-architecture)).

## Database Migration

For existing deployments, run the migration to add the `entra_oid` column:

```sql
-- Run this migration script
psql -d teamskills -f database/migrations/001_add_entra_oid.sql
```

Or the column will be added automatically on next `/api/admin/init` call.
