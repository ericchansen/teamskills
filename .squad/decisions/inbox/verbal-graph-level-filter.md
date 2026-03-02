### Default Graph to L400-Only with Level Toggles

**Author:** Verbal (Frontend Dev)  
**Date:** 2026-03-02

## Context

The graph view was unreadable — 5 people × 146 skills at all proficiency levels created a dense ball of edges. Users couldn't extract any signal from the visualization.

## Decision

Added a proficiency level filter that defaults to showing **only L400 (expert)** connections. Users can toggle on L300, L200, L100 individually. Skill nodes with no visible connections at the selected levels are hidden entirely — no orphan nodes cluttering the view.

A "Show All / Expert Only" quick toggle provides fast switching between sparse (expert) and full views.

## Rationale

- **Sparse by default:** L400 connections are the most valuable signal (who are the experts?). Starting sparse lets users opt-in to density.
- **Filter at data level:** Links and nodes are filtered before D3 rendering, not via CSS/DOM hiding. This gives D3 a cleaner force simulation with fewer nodes.
- **Minimum one level:** At least one level must remain selected to prevent an empty graph.

## Impact

- Graph loads sparse and readable by default
- Users can progressively reveal more connections
- No backend changes required — filtering is purely client-side
