# Decision: Synchronous Resource Deletion in PR Cleanup

**Date:** 2026-03-02  
**Author:** McManus (DevOps Engineer)  
**Status:** Implemented

## Context

The `pr-cleanup.yml` workflow was reporting "success" but silently failing to delete staging resources. Investigation revealed 5 orphaned PR environments (pr25, pr27, pr34, pr35, pr36) despite successful workflow runs.

## Root Cause

The workflow used `--no-wait` flags on Azure CLI delete commands:
- Container app deletes (`az containerapp delete --no-wait`)
- Environment deletes (`az containerapp env delete --no-wait`)

This caused a race condition:
1. Container app deletes started asynchronously
2. Environment delete fired immediately — but environments can't delete while dependent apps exist
3. Environment delete failed silently (async operation)
4. Workflow reported success because CLI commands returned exit code 0

## Decision

**Always use synchronous deletes in cleanup workflows.**

Changes made to `pr-cleanup.yml`:
1. Removed `--no-wait` from container app deletes
2. Added 30-second sleep between app and environment deletions
3. Removed `--no-wait` from environment deletes
4. Added verification step that counts remaining resources and fails if any remain

## Rationale

- **Reliability over speed:** Cleanup workflows must guarantee complete resource deletion
- **Cost prevention:** Orphaned staging resources accrue unnecessary Azure costs
- **Early failure detection:** Verification step surfaces problems immediately instead of silently accumulating orphans
- **Azure eventual consistency:** The 30s sleep accounts for Azure's backend processing time

## Implications

- PR cleanup will take 30-60s longer (acceptable tradeoff)
- Failed cleanups will now fail loudly with exit code 1
- Team will be notified of cleanup failures via GitHub workflow status
- Manual cleanup of existing orphans (pr25, pr27, pr34, pr35, pr36) required

## Alternatives Considered

- **Polling with timeout:** More complex, same result
- **Azure Resource Manager API:** Overkill for this use case
- **Leaving --no-wait:** Unacceptable due to cost and orphan accumulation
