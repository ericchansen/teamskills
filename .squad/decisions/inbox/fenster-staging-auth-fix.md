# Decision: Easy Auth openIdIssuer Must Match Token Version

**Author:** Fenster (Backend Dev)  
**Date:** 2026-02-27

## Context

PR #23 staging deployment had MSAL login succeeding but `/api/auth/me` returning 401. Users saw "Unable to load your profile" after authenticating.

## Root Cause

The Entra ID app registration (`69c41897-2a3c-4956-b78d-56670cdb5750`) has `accessTokenAcceptedVersion: null`, which defaults to **v1.0 access tokens**. V1.0 tokens have issuer `https://sts.windows.net/{tenant}/`, but Easy Auth was configured with a v2.0 `openIdIssuer` (`https://login.microsoftonline.com/{tenant}/v2.0`). The issuer mismatch caused Easy Auth to reject valid tokens before they reached Express.

## Decision

1. Changed Easy Auth `openIdIssuer` in `infra/staging/main.bicep` to the v1.0 format: `https://sts.windows.net/{tenant}/`
2. Added `/api/auth/config` to Easy Auth `excludedPaths` (public endpoint needed pre-login)
3. Separated auth errors from DB errors in Express `requireAuth` (401 vs 500)

## Consequences

- Staging auth flow should now work end-to-end with v1.0 tokens
- If the app registration is later updated to `accessTokenAcceptedVersion: 2`, the Easy Auth `openIdIssuer` must be changed back to the v2.0 format
- Any production Bicep must use the same v1.0 issuer pattern
- Express middleware (`auth.js`) already handles both v1 and v2 issuers — no Express changes needed for token version

## Review Required

- **McManus (DevOps)**: Bicep infrastructure change
- **Kobayashi**: Auth middleware change (error handling separation)
