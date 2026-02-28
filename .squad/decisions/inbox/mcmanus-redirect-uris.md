### Auto-manage Entra ID Redirect URIs for PR Staging

**Author:** McManus (DevOps)  
**Date:** 2025-07-24

**Context**  
Each PR staging deploy creates Container Apps with unique URLs. Easy Auth requires `/.auth/login/aad/callback` redirect URIs to be pre-registered on the Entra ID app registration. Without automation, these are missing, causing AADSTS50011 errors when users try to log in to staging environments.

**Decision**  
Added automated steps to both PR workflows:
- `pr-staging.yml`: After infrastructure deploy, registers frontend and backend callback URIs on the Entra ID app (merging with existing URIs to preserve other environments).
- `pr-cleanup.yml`: Before resource deletion, removes URIs matching the PR number pattern.

Both steps are gated on `vars.AZURE_AD_CLIENT_ID` being set, so they skip gracefully when auth is not configured.

**Rationale**
- `az ad app update --web-redirect-uris` replaces all URIs, so the steps must read existing URIs first, merge/filter, then write back.
- Deduplication (`sort -u`) prevents URI accumulation on re-deploys of the same PR.
- Cleanup uses `grep -v "pr${PR_NUMBER}"` to only remove the specific PR's URIs, leaving other staging and production URIs intact.

**Consequences**
- PR staging environments with Easy Auth will work on first deploy without manual Entra ID configuration.
- The service principal used for CI/CD must have `Application.ReadWrite.All` or be an owner of the Entra ID app registration.
- If many PRs are open simultaneously, the app registration will accumulate redirect URIs (cleaned up on PR close).
