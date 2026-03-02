# CONSTRAINT: Zero Permissions in Microsoft Corp Tenant (72f988bf)

**Author:** McManus (DevOps) + Eric Hansen  
**Date:** 2026-03-02  
**Status:** Active constraint — PERMANENT  
**Priority:** BLOCKING — affects all Entra ID automation decisions

## The Constraint

The team has **ZERO permissions** in Microsoft corp tenant `72f988bf-86f1-41af-91ab-2d7cd011db47`. We cannot:

- Create, modify, or delete app registrations
- Modify redirect URIs on existing app registrations  
- Run `az ad app update` or any Graph API calls
- Deploy Bicep `Microsoft.Graph/applications` resources
- Use Terraform AzureAD provider against this tenant
- Do ANYTHING that requires authentication or authorization in this tenant

## Why This Matters

The Entra ID app registration "Team Skills Tracker" (app ID `69c41897-2a3c-4956-b78d-56670cdb5750`) lives in tenant `72f988bf`. This app handles MSAL authentication for the frontend.

The CI/CD service principal `github-teamskills` (client ID `9d8d893b-c810-407e-98bb-5e3b83dc056d`) lives in tenant `9c74def4`. Even though it's listed as an owner of the Entra app, it CANNOT authenticate to tenant `72f988bf` because its backing app registration has `signInAudience: AzureADMyOrg` (single-tenant).

## What We CAN Do

- Deploy infrastructure in subscription `f7858112-5c13-46e5-8341-3851a12164fa` (tenant `9c74def4`)
- Manage Azure resources: ACR, Container Apps, PostgreSQL, etc.
- Create NEW app registrations in tenant `9c74def4` (if needed for staging)

**We CANNOT do anything in tenant 72f988bf — not even manually. Eric does not have admin permissions there. Nobody on this team does. Stop suggesting it.**

## Invalidated Approaches

The following approaches from earlier in this session are NO LONGER VIABLE:

1. ~~Automated `az ad app update` in pr-staging.yml~~ — SP can't auth to 72f988bf
2. ~~Tenant-switching login steps in CI/CD~~ — SP is single-tenant, can't login to 72f988bf
3. ~~Bicep `Microsoft.Graph/applications`~~ — deploys target 9c74def4, app is in 72f988bf
4. ~~Terraform AzureAD provider~~ — same cross-tenant auth issue

## Decision Record: kobayashi-staging-redirect-uri.md is OUTDATED

The existing decision at `.squad/decisions/inbox/kobayashi-staging-redirect-uri.md` was written BEFORE this constraint was discovered. Its "Implemented" status is misleading — the implementation exists in code but WILL NOT WORK at runtime due to this cross-tenant barrier.
