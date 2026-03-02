# McManus Decision: Staging Environment Documentation

**Author:** McManus (DevOps)  
**Date:** 2026-03-03  
**Status:** Completed

## What Was Done

Created comprehensive bootstrap and operational documentation for the per-PR staging environment.

### Artifacts

1. **`docs/staging-environment.md`** — New document covering:
   - Overview of per-PR preview deployments
   - **Bootstrap prerequisites** (one-time Entra ID setup with exact `az` CLI commands)
   - Detailed deployment flow (Bicep provision → app registration → containers)
   - Why staging and production use different tenants (cross-tenant constraint)
   - Troubleshooting guide
   - Developer workflow (testing, local vs staging comparison)

2. **`README.md`** — Added link to new staging docs in "PR Preview Environments" section

3. **`.squad/agents/mcmanus/history.md`** — Updated with documentation completion

## Key Decision Points

### Bootstrap Command Documentation

Documented the exact sequence developers need to run **once per tenant** before staging deploys can work:

```bash
# Login to the managed environment tenant
az login --tenant 9c74def4-40b4-4c76-be03-235975db1351

# Add Application.ReadWrite.OwnedBy Graph API permission to the SP
az ad app permission add \
  --id 9d8d893b-c810-407e-98bb-5e3b83dc056d \
  --api 00000003-0000-0000-c000-000000000000 \
  --api-permissions 18a4783c-866b-4cc7-a460-3d5e5662c884=Role

# Grant admin consent
az ad app permission admin-consent --id 9d8d893b-c810-407e-98bb-5e3b83dc056d
```

This grants the CI/CD service principal permission to dynamically create app registrations in the team's own Entra ID tenant.

### Why Separate Tenants

The documentation explicitly explains the cross-tenant constraint:
- **Production tenant (72f988bf):** Microsoft corp — team has ZERO permissions
- **Staging tenant (9c74def4):** Team's managed environment — team has full control

Staging cannot reuse the production app registration because nobody has permissions to modify it.

### Linking to Decision History

The document links to `.squad/decisions.md#-constraint-zero-permissions-in-microsoft-corp-tenant-72f988bf--permanent` for full decision context, so readers understand the architectural reasoning.

## Rationale

### Why Document This?

1. **Onboarding:** New developers need to know the bootstrap step exists
2. **Clarity:** The staging system uses Bicep `Microsoft.Graph/applications` — not obvious why or what permissions are needed
3. **Prevention:** Without this, developers get cryptic auth failures during first PR staging deploy
4. **Audit:** Documents the architectural choice of per-PR app registrations (why not reuse prod app?)

### Why in `docs/`?

- Operational documentation belongs in `docs/` (not in code comments or commit messages)
- Parallels existing auth documentation (`docs/authentication.md`)
- Discoverable for new team members exploring the repo

## Impact

### For Developers
- Clear instructions for getting PR staging working
- Troubleshooting steps for common failures
- Explanation of why staging auth works differently from production

### For DevOps / Future Me
- Single source of truth for staging environment prerequisites
- Reduces support questions about "why doesn't auth work on staging?"
- Context preserved when the cross-tenant constraint is referenced later

### For the Org
- Documentation asset that supports onboarding
- Audit trail of architectural decisions (why separate tenants)

## Alternatives Considered

### Embed in README.md
**Rejected:** README would become too long. Staging is complex enough to warrant its own document.

### Inline Bicep comments
**Rejected:** Comments in infrastructure code aren't discoverable by developers during PR review. Separate docs are better.

### Decision-only documentation (no operational docs)
**Rejected:** Just explaining the decision isn't enough — developers need step-by-step bootstrap instructions.

## Success Criteria

- [x] `docs/staging-environment.md` created with bootstrap commands
- [x] README.md links to staging docs
- [x] Documentation explains the cross-tenant constraint and why
- [x] Troubleshooting section covers common failure modes
- [x] History file updated with completion

---

## Next Steps (for team)

- Review the bootstrap section and verify commands are current
- When teams inherit this project, point them to `docs/staging-environment.md`
- If staging Bicep changes in the future (e.g., adding new Graph API calls), update the "Why This Is Needed" section
