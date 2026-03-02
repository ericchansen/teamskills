# Decision: Inline CSV content support for sync endpoint

**Author:** Fenster (Backend Dev)
**Date:** 2025-07-14
**Status:** Implemented

## Context
The `/api/admin/sync-skills` endpoint only supported reading CSV data from a file on disk (`cloud-solutions-engineer-skills.csv`). This required the CSV to be deployed alongside the app or present in the container, which is problematic because the file contains PII (real team member names/roles).

## Decision
Accept optional `csvContent` string in the POST body. When provided, parse it directly using a new `parseCSVContent()` function extracted from `parseCSV()`. The file-based path remains as fallback. The CSV file was also added to `.gitignore`.

## Rationale
- **PII safety:** Callers can POST CSV content at runtime without the file ever touching source control or container images.
- **Minimal change:** Extracted content-parsing logic into its own function; added a 3-line branch in `sync()` and a 3-line passthrough in the route handler.
- **Backward compatible:** Existing file-based flow is untouched when `csvContent` is omitted.

## Alternatives Considered
- **Upload endpoint with multipart form:** More complex, not needed for a single admin API.
- **Store CSV in Azure Blob and read at sync time:** Good for automation but adds Azure dependency for a simple sync.
