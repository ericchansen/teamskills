### 2026-03-02T18:55:00Z: Round Table Priority Review
**By:** Eric Hansen (via Knights of the Round Table — Claude Opus, GPT-5.3-Codex, Gemini 3 Pro)
**What:** Three-model review of backlog priorities reached consensus on these key findings:

**Unanimous (High Confidence):**
- health-check-db is urgent — /health lies when DB is down, dangerous with ACA liveness probes
- cicd-subscription-set is cheap insurance (5 min, prevents wrong-subscription deploys)
- bootstrap-sp-graph should be deferred until tenant admin access available
- SharePoint sync service has zero tests — significant regression risk

**Critical Discovery (NOT on original backlog):**
- process.exit(-1) in backend/db.js kills the backend on transient DB errors — WILL crash in production with auto-pausing Flex Server
- No SIGTERM handler — ACA scale-down kills in-flight requests
- These are MORE urgent than any existing backlog item

**Nuanced Finding:**
- fetch-timeout (15s) would actively break the app during DB wake (45-60s) — wire-wake-url MUST come first
- auto-migrate needs a real migration framework, not raw ALTER TABLE in scaled environment

**Agreed Priority Order:**
1. Fix process.exit(-1) + add SIGTERM handler (~20 min)
2. health-check-db (~15 min)
3. cicd-subscription-set (~5 min)
4. wire-wake-url (~15 min)
5. fetch-timeout with safe timeout value (~20 min)
6. test-new-code (1-2 hrs)
7. cicd-rollback or ACA canary (2 hrs)
8. auto-migrate with proper framework (1 hr)
9. e2e-regression (30 min)
10. bootstrap-sp-graph (deferred)

**Why:** Three independent AI models analyzed from Devil's Advocate, Explorer, and Steelman perspectives. Consensus was strong on items 1-5.
