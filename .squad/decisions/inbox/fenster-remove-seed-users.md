### Remove Fictional Seed Users from Init Endpoint

**Author:** Fenster (Backend Dev)  
**Date:** 2026-03-02

## Context

The `/api/admin/init` endpoint seeded 14 fictional demo users (Alex Chen, Jordan Rivera, Morgan Taylor, etc.) and ~130 user_skill assignments into the database. In production, this mixed fake data with the 5 real team members imported via `/api/admin/sync-skills` CSV sync, polluting the skills graph and user list.

## Decision

Removed all `INSERT INTO users` and `INSERT INTO user_skills` statements for fictional users from the init endpoint. The skill categories and skills catalog (the real data) are preserved. Users are now populated exclusively via `/api/admin/sync-skills` with real CSV data.

## Rationale

- Init should set up the schema and skill catalog, not fake user data
- Production had 14 phantom users appearing in the graph alongside real team members
- The CSV sync endpoint already handles user population correctly
- `database/seed.sql` retains demo data for local dev (now labeled LOCAL DEV ONLY)

## Impact

- `/api/admin/init` no longer creates any users or user_skills — only schema + skill catalog
- Production DB must be populated via `/api/admin/sync-skills` after init
- No test impact (all 75 tests pass — none depended on the seed users)
- `database/seed.sql` unchanged except for clarifying header comment
