### 2026-03-02T20:15:00Z: User directive — Authentication is MANDATORY on production
**By:** Eric Hansen (via Copilot)
**What:** Production absolutely needs a login. 100%. Always will. The data is PII (real employee names + skills proficiency levels). Never suggest removing auth or running in "demo mode" in production. This is non-negotiable.
**Why:** User request — captured for team memory. Coordinator made the grave mistake of suggesting removing auth as "Option A: Demo mode (recommended)." This was wrong. Skills matrix data is PII. Exposing it without authentication would be a security and privacy violation.
