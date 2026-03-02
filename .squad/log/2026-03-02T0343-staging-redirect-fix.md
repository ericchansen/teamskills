# Session: Staging Redirect URI Fix

**Date:** 2026-03-02 03:43 UTC  
**Status:** In Progress

## Context
- Eric merged PR #31 (ACR name fix)
- Deployment running
- Investigating AADSTS50011 errors in staging environment

## Work Item
- **Agent:** Kobayashi (Auth/Security)
- **Task:** Design and implement Entra redirect URI management in PR staging/cleanup workflows
- **Goal:** Fix AADSTS50011 errors by automating Entra app registration configuration during PR lifecycle

## Next Steps
1. Kobayashi designs Entra redirect URI management system
2. Implement in PR staging workflow
3. Implement in PR cleanup workflow
4. Validate against AADSTS50011 errors
