# Decision: Match CSV Users by Name, Not Placeholder Email

**Author:** Fenster (Backend Dev)  
**Date:** 2026-03-03

## Context

The pivot CSV importer (`syncPivotToDatabase`) generated placeholder emails from display names (e.g., `eric.hansen@placeholder.local`) and used those to look up existing users. If a user already existed with a real email (from Entra ID auth or seed data), the lookup missed them and created a duplicate.

## Decision

Changed user matching from `WHERE email = $1` (placeholder email) to `WHERE LOWER(name) = LOWER($1)` (case-insensitive display name). When matched, only the `team` field is updated — existing `email` and `entra_oid` are preserved. Placeholder emails are only created for genuinely new users.

Also added `POST /api/admin/reset-users` (requires `INIT_SECRET`) to wipe all users/skills data for a clean slate when duplicates have already been created.

## Trade-offs

- Name-based matching assumes display names are unique within the team. For a 5-person team this is safe; at scale, a more robust identifier (employee ID, UPN) would be needed.
- The reset endpoint is destructive by design — it's a nuclear option for when duplicates have already polluted the DB.

## Impact

- Re-syncing CSV no longer creates duplicate users
- Existing users' auth identity (entra_oid, email) is never overwritten by the importer
- Backward-compatible with `source: 'csv'` flat importer (only `syncPivotToDatabase` was changed)
