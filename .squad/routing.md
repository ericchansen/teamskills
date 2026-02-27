# Routing Rules

## Signal → Agent Mapping

| Signal | Route To | Notes |
|--------|----------|-------|
| React, Vite, UI, component, MSAL frontend, login page | Verbal | Frontend work |
| Express, API, endpoint, middleware, JWT backend, database query | Fenster | Backend work |
| Bicep, IaC, Azure, deployment, GitHub Actions, CI/CD, staging, container app | McManus | DevOps/Infra |
| Test, Playwright, Jest, E2E, unit test, QA, coverage | Hockney | Testing |
| Auth, MSAL, Entra ID, JWT, RBAC, security, token, permissions | Kobayashi | Auth/Security |
| Architecture, design decision, code review, tradeoff | Keaton | Lead oversight |
| Multi-domain, "team" request | Keaton + relevant agents | Fan-out |

## Review Gates

| Artifact | Reviewer |
|----------|----------|
| API endpoints | Keaton (architecture), Kobayashi (security) |
| Auth config | Kobayashi |
| IaC / Bicep | Keaton |
| Frontend components | Keaton |
| Test coverage | Hockney |
