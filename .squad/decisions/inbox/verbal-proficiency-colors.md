### Single Source of Truth for Proficiency Level Colors and Descriptions

**Author:** Verbal (Frontend Dev)
**Date:** 2026-03-02

## Context

Proficiency level colors (L100–L400) were defined independently in three frontend components:

- **ProficiencyBadge.jsx** — Fluent UI palette (red/orange/blue/green)
- **CoverageDashboard.jsx** — Tailwind-like palette (blue/green/yellow/red)
- **TrendsChart.jsx** — Flat UI palette (red/orange/blue/green) — unused

The Experimental view (CoverageDashboard) had completely different L100–L400 colors than the Matrix view (ProficiencyBadge), creating visual inconsistency.

Proficiency level labels ("L100 - Foundational", etc.) were also hardcoded separately in UserProfile.jsx.

## Decision

1. **ProficiencyBadge.jsx is the single source of truth** for proficiency level metadata: colors, labels, and descriptions.
2. Added a `LEVEL_COLORS` export (derived from `PROFICIENCY_CONFIG`) for chart-friendly color lookup.
3. CoverageDashboard now imports `LEVEL_COLORS` from ProficiencyBadge.
4. Removed dead `LEVEL_COLORS` from TrendsChart.
5. UserProfile dropdown now generates options from `PROFICIENCY_CONFIG`.
6. Added a source citation comment referencing the Microsoft L100–L400 taxonomy and CSU Tech Intensity Skill Proficiency Standards.

## Rationale

- One canonical source prevents color/label drift across views.
- The Fluent UI palette from ProficiencyBadge is consistent with Microsoft design standards.
- Descriptions are adapted from the Microsoft standard for a skills-tracker context; exact internal wording is on SharePoint (inaccessible externally).

## Impact

- All views now show consistent L100–L400 colors.
- Future components should import from `ProficiencyBadge` rather than defining their own level colors.
