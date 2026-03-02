---
name: "powershell-pr-formatting"
description: "Avoid shell escaping bugs when creating GitHub PRs from PowerShell"
domain: "git-workflow"
confidence: "high"
source: "incident — PR #33 had broken markdown (backslash-backtick rendering)"
---

## Context

When running `gh pr create` or `gh pr edit` from PowerShell on Windows, markdown formatting breaks if the `--body` string contains backticks. PowerShell uses the backtick as its escape character, so `\`` in a double-quoted string passes a literal backslash to the GitHub API. This causes commit SHAs like `` `58a3f49` `` to render as `\58a3f49\` on GitHub.

This bug is subtle because the PR body looks correct in the terminal but renders incorrectly on GitHub.com.

## Pattern — Always Use --body-file

**NEVER** pass PR body content inline via `--body` when on PowerShell. Instead:

1. Write the markdown body to a temp file using a PowerShell here-string (`@"..."@`)
2. Pass the file via `--body-file`
3. Clean up the temp file after

## Example

```powershell
# ✅ CORRECT — file-based approach, no escaping issues
$body = @"
## Summary
- Fixed the auth bug in `backend/routes/auth.js`

## Changes
| Commit | Description |
|--------|-------------|
| 58a3f49 | Fix token refresh logic |
| 782a503 | Add retry on 401 |
"@
$body | Out-File -FilePath "$env:TEMP\pr-body.md" -Encoding utf8NoBOM
gh pr create --title "fix: Auth token refresh" --body-file "$env:TEMP\pr-body.md" --base master
Remove-Item "$env:TEMP\pr-body.md" -ErrorAction SilentlyContinue
```

```powershell
# ❌ WRONG — inline body with backticks breaks on PowerShell
gh pr create --title "fix: Auth" --body "Fixed `58a3f49` commit issue"
# Result on GitHub: "Fixed \58a3f49\ commit issue"
```

## Also Applies To

- `gh pr edit --body` → use `--body-file` instead
- `gh issue create --body` → use `--body-file` instead
- Any `gh` command that accepts `--body` with markdown content

## Anti-Patterns

- **Inline `--body` with backticks** — Will always break on PowerShell
- **Escaping backticks with more backticks** — Fragile, hard to read, still breaks in edge cases
- **Single-quoted strings with backticks** — Single quotes prevent variable expansion but backtick handling is still inconsistent
