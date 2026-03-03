# Decision: Name-Based User Matching Uniqueness Guard

**Author:** Fenster (Backend Dev)
**Date:** 2025-07-18
**Status:** Implemented

## Context
The `findOrCreateUser()` function in `backend/auth.js` has a name-based fallback that links CSV-imported users (who have placeholder emails) to their Entra ID identity when they first sign in. The query `SELECT * FROM users WHERE LOWER(name) = LOWER($1)` could return multiple rows if two users share the same display name.

Previously, `result.rows.length > 0` would silently pick the first match — corrupting both users' records by assigning one person's Entra OID and email to another's row.

## Decision
Changed the condition from `> 0` to `=== 1`. The name fallback now only fires when exactly one user matches. If multiple matches exist, a warning is logged and the flow falls through to create a new user instead.

## Why Not Add a UNIQUE Constraint on `name`?
The `users` table intentionally allows duplicate names. CSV imports from real team rosters can legitimately have two people with the same name on different teams. Adding a UNIQUE constraint would break imports.

## Impact
- No change to the happy path (single name match still links correctly)
- Prevents identity corruption when duplicate names exist
- New users with ambiguous names get clean records instead of inheriting someone else's data
- Added test coverage: "should not match by name when multiple users have the same name"
