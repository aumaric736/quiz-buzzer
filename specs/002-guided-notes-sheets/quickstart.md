# Quickstart Validation: Guided Notes 匯入與匯出

This guide validates the local React client and Express service against a Google Sheets test worksheet. The service stays on loopback; only the server calls Google Sheets. Use a test spreadsheet with no sensitive class or student data.

## Prerequisites

- Node.js 22.12 or later and npm.
- A Google Cloud project with the Google Sheets API enabled and a dedicated service account.
- The two teacher-provided samples establish the currently verified layout patterns: multi-row questions with numbered adjacent blanks, and single-row questions with one merged blank each. Unknown or ambiguous layouts fail closed.
- Share the test sheet with the service-account email. Grant read access for import and editor access for export.
- Do not edit the test sheet from another window while an export is in progress; the API does not provide an atomic conditional write against simultaneous collaborators.
- The separate answer subfeature's per-question winning-group / ordered-answer-parts contract, or a test-only provider fixture.

## Local Configuration

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` in the local ignored `.env`. Use only the local environment file or an environment manager for the real key; never commit it, paste it into a prompt, or put it in a screenshot. `.env.example` contains variable names and safe placeholders only; `.gitignore` excludes `.env`.

Start the service and client in separate PowerShell windows:

```powershell
npm.cmd run dev --workspace=server
```

```powershell
npm.cmd run dev --workspace=client
```

Open the Vite local URL printed in its terminal (normally `http://127.0.0.1:5173`).

## Automated Verification

Run from the repository root:

```powershell
npm.cmd test
npm.cmd run build
```

The test suite uses a fake Sheets gateway and does not require real credentials. Current result (2026-11-20): `npm.cmd test` passes 27 test files / 88 tests; `npm.cmd run build` completes the shared, server, and client production builds. Coverage includes both supplied sample layouts and shifted-coordinate writeback, app-level answer-provider injection, question count mismatch, missing/ambiguous blanks, answer ordering, no winner, permissions, source changes, and uncertain writes.

## Manual Acceptance Run

1. Create separate test activities and import each provided sample sheet. Verify the detected question numbers create the activity question list without importing question text.
2. The `題組` sample has four questions and six ordered blanks; the `單題` sample has six questions and one merged blank per question. The acceptance fixture verifies both patterns at their supplied positions and after row/column shifts; source coordinates are not encoded in the recognizer.
3. Try a sheet with a mismatched existing question count, unknown layout, missing blank, and an unshared/reader-only account. Verify each failure explains the issue and leaves local mappings or the source document unchanged.
4. End the activity and provide test winner records, including a multi-blank answer, a no-winner question, and a part-count mismatch.
5. Verify the preview lists each answer part and target blank order. Cancel one preview and confirm no sheet cells changed.
6. Confirm another preview and verify only valid detected blanks were filled; all other cell values and formats remain unchanged.
7. Change the worksheet structure between preview and confirmation; verify the old preview is rejected and a fresh preview is required.
8. Simulate a write timeout after request submission; verify the server rereads targets to reconcile before allowing any retry and does not claim success while outcome is unknown.
9. Confirm logs and API errors contain no credentials, raw response payload, or worksheet answer values.

For the current implementation, only these two sample-backed layout patterns have evidence. Do not include prompt contents or credentials in logs or reports.
