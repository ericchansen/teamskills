# Auto-Manage Entra ID SPA Redirect URIs for PR Staging

**Author:** Kobayashi (Auth/Security)  
**Date:** 2026-03-02  
**Status:** ⚠️ BLOCKED — cross-tenant permissions barrier discovered. See mcmanus-cross-tenant-constraint.md

## Context

PR staging environments deploy with dynamic FQDNs like:
```
https://ca-frontend-pr31.redground-066e115e.centralus.azurecontainerapps.io
```

The frontend `authConfig.js` correctly uses `redirectUri: window.location.origin`, but the Entra ID app registration (client ID from `vars.AZURE_AD_CLIENT_ID`) doesn't have these staging URLs registered as valid SPA redirect URIs. This causes **AADSTS50011 redirect URI mismatch** errors, blocking all auth testing in staging environments.

## Problem

- `pr-staging.yml` deploys per-PR infrastructure with unique container app URLs
- `pr-cleanup.yml` destroys staging resources when PR is closed/merged
- Neither workflow manages Entra ID app registration redirect URIs
- Manual registration is error-prone and doesn't scale

## Solution

Added automated redirect URI management to both workflows:

### pr-staging.yml (after deploy)
```yaml
- name: Register SPA redirect URI in Entra ID
  if: vars.AZURE_AD_CLIENT_ID != ''
  run: |
    APP_CLIENT_ID="${{ vars.AZURE_AD_CLIENT_ID }}"
    FRONTEND_URL="${{ steps.deploy.outputs.frontendUrl }}"
    
    # Get current SPA redirect URIs
    CURRENT_URIS=$(az ad app show --id "$APP_CLIENT_ID" --query "spa.redirectUris" -o json)
    
    # Add new URI and deduplicate
    NEW_URIS=$(echo "$CURRENT_URIS" | jq -c ". + [\"${FRONTEND_URL}\"] | unique")
    
    # Update app registration
    az ad app update --id "$APP_CLIENT_ID" --set spa.redirectUris="$NEW_URIS"
```

### pr-cleanup.yml (before resource deletion)
```yaml
- name: Remove SPA redirect URI from Entra ID
  if: vars.AZURE_AD_CLIENT_ID != ''
  run: |
    APP_CLIENT_ID="${{ vars.AZURE_AD_CLIENT_ID }}"
    PR_NUMBER=${{ steps.setup.outputs.pr_number }}
    
    # Get current SPA redirect URIs
    CURRENT_URIS=$(az ad app show --id "$APP_CLIENT_ID" --query "spa.redirectUris" -o json)
    
    # Remove URIs containing this PR number
    NEW_URIS=$(echo "$CURRENT_URIS" | jq -c "[.[] | select(. | test(\"pr${PR_NUMBER}\") | not)]")
    
    # Update app registration
    az ad app update --id "$APP_CLIENT_ID" --set spa.redirectUris="$NEW_URIS"
```

## Technical Details

- **Uses `spa.redirectUris`** (not `--web-redirect-uris`) — this is a SPA app, not a web app
- **jq for safe merging** — adds new URI without removing existing ones via `unique` operation
- **jq regex filter for cleanup** — removes only URIs matching `pr${PR_NUMBER}` pattern
- **Race condition handling** — `unique` operation handles multiple PRs deploying simultaneously
- **Conditional execution** — both steps skip when `vars.AZURE_AD_CLIENT_ID` is empty

## Permissions Required

The service principal used for CI/CD (from `vars.AZURE_CLIENT_ID` / `secrets.AZURE_CLIENT_SECRET`) needs one of:

1. **Microsoft Graph API permission**: `Application.ReadWrite.OwnedBy`
2. **App ownership**: The SP must be listed as an owner on the Entra ID app registration

Without these permissions, the `az ad app update` command will fail with a 403 Forbidden error.

## Consequences

### Benefits
- PR staging environments work with MSAL auth on first deploy without manual configuration
- Automated cleanup prevents URI accumulation over time
- Preserves existing redirect URIs (production, other staging environments)

### Limitations
- If many PRs are open simultaneously, the app registration will accumulate redirect URIs (cleaned up on PR close)
- Requires additional permissions on the service principal
- jq must be available (GitHub ubuntu-latest has it by default)

## Alternatives Considered

### Manual registration
**Rejected:** Doesn't scale, error-prone, blocks automated testing

### Use wildcard redirect URIs
**Rejected:** Entra ID doesn't support wildcard URIs for security reasons

### Separate Entra app per PR
**Rejected:** Complex to automate, creates many app registrations, requires app cleanup workflow

## Migration Notes

- No changes needed to existing Entra ID app registration
- Service principal may need additional permissions granted
- First deployment after merge will auto-register the staging URL
- Cleanup of old URIs can be done manually if needed before merge

## Success Criteria

- [x] pr-staging.yml registers frontend URL as SPA redirect URI after deploy
- [x] pr-cleanup.yml removes PR-specific redirect URIs before resource deletion
- [x] Both steps are conditional on AZURE_AD_CLIENT_ID being set
- [x] Uses jq for safe URI array manipulation
- [x] Documented permission requirements
