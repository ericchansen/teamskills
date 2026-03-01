# Keaton — History

## Project Context
- **Project:** Team Skills Tracker — React + Vite frontend, Express backend, PostgreSQL, Azure Container Apps
- **User:** Eric Hansen
- **Current Focus:** Fix CI/CD staging deployment and authentication setup
- **Auth:** Microsoft Entra ID via MSAL browser (frontend) + JWT bearer validation (backend)
- **IaC:** Azure Bicep in `infra/`, deployed via `azd`
- **CI/CD:** GitHub Actions (`ci-cd.yml`, `pr-staging.yml`, `pr-cleanup.yml`)
- **Key files:** `infra/main.bicep`, `infra/core/`, `infra/app/`, `.github/workflows/`

## Learnings

### 2026-03-01 — PR #24–#28 Strategic Review

**Arc:** PRs #25→#27→#28 form a clean stabilization arc: fix broken infra → harden auth → polish CI/CD. PR #24 was wisely closed (stable staging conflicted with per-PR isolation). PR #26 routine Dependabot.

**What's working well:**
- azd adoption for production deploy is the right call — single tool for provision + deploy
- Round Table (3-model AI consensus) review process producing real findings (PR #27 multi-tenant JWKS, cache reduction)
- Hardcoded URLs, dead config, and unnecessary Graph API permissions are being actively retired
- Production auth enforcement decision (503 on misconfigured prod) is solid
- Dependabot skip for staging deploy saves real Azure costs

**Architecture concerns flagged:**
1. **Staging ≠ Production parity**: Production uses `azd`, staging uses raw `azure/arm-deploy`. Different deploy paths = different failure modes. Should converge.
2. **Hardcoded ACR name** in `pr-staging.yml` (`crgvojq4dgzbtk4`) couples staging to current prod. If prod reprovisioned, staging breaks silently.
3. **Demo user in backend auth** (PR #28): `req.user = {id:1, ...}` added to both `requireAuth` and `optionalAuth` when auth not configured. Production guarded by NODE_ENV check, staging Bicep now sets `NODE_ENV=staging` — so staging gets demo mode if auth env vars missing. Frontend has localhost gate per team decision, but backend has no equivalent hostname check.
4. **No E2E in CI**: Pipeline runs lint + unit tests only. Smoke test validates config injection but not actual user flows.

**What should come next:**
- Merge PR #28 (fixes are correct, the env name mismatch is critical)
- Converge staging deploy to use azd (eliminate the two-path problem)
- Add E2E test stage or at minimum health-check integration tests
- Consider extracting ACR name to GitHub vars instead of hardcoding
