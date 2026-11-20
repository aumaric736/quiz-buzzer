# API Contracts: Guided Notes 匯入與匯出

These local service contracts follow the component and sequence diagrams. The Node/Express server calls the official Google Sheets API using the server-configured service account. The React client never receives Google credentials or calls Google directly. All routes require a local teacher session in `X-Local-Session-Id`, activity ownership, JSON input validation, and sanitized error mapping.

## Common Rules

- Bind the local service to `127.0.0.1` as in the existing application.
- Requests use JSON; reject unknown fields and validate identifiers and lengths.
- Responses use existing API errors `{ "code": "STABLE_CODE", "message": "Clear user-facing reason" }`.
- Never log service-account credentials/private keys, answer parts, worksheet values, authorization headers, raw Google responses, or raw request bodies.
- Spreadsheet URLs are parsed locally to extract an allowed Google Sheets ID; the server never fetches arbitrary URLs from a request.
- The answer provider is an internal typed contract, not a public client endpoint.

## Worksheet Discovery

### `POST /api/activities/{activityId}/guided-notes/worksheets`

Request:

```json
{ "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/<id>/edit" }
```

The service validates activity/session ownership, parses the spreadsheet id, and uses service-account access to read only workbook metadata.

Response `200`:

```json
{ "spreadsheetId": "opaque-id", "worksheets": [{ "sheetId": 0, "title": "Guided Notes" }] }
```

The teacher selects one returned `sheetId` for import. Missing access returns `403 SHEETS_ACCESS_DENIED`; missing workbook returns `404 SHEET_NOT_FOUND`.

## Import

### `POST /api/activities/{activityId}/guided-notes/import`

Request:

```json
{ "spreadsheetId": "opaque-id", "sheetId": 0 }
```

The service reads selected worksheet data and performs deterministic recognition using the supported patterns derived from user samples. It creates the activity question list if none exists. Existing question rows are preserved when count matches; a mismatch rejects the import and changes no local state.

Response `201`:

```json
{
  "source": { "spreadsheetId": "opaque-id", "sheetId": 0, "sheetTitle": "Guided Notes" },
  "questions": [{ "questionNumber": 1, "blankCount": 2 }],
  "structureFingerprint": "opaque-fingerprint"
}
```

The response exposes blank counts, not worksheet contents. Errors include:

- `400 INVALID_SPREADSHEET_ID` / `400 INVALID_WORKSHEET_ID`
- `403 SHEETS_ACCESS_DENIED`
- `404 SHEET_NOT_FOUND` / `404 WORKSHEET_NOT_FOUND`
- `409 QUESTION_COUNT_MISMATCH` (no local import changes)
- `422 QUESTION_LAYOUT_UNRECOGNIZED`, `422 BLANK_NOT_FOUND`, or `422 AMBIGUOUS_LAYOUT` (no local import changes)
- `502 SHEETS_UNAVAILABLE` for sanitized remote service failures

## Export Preview

### `POST /api/activities/{activityId}/guided-notes/export-previews`

Requires activity phase `已結束`. The server obtains winner results from the answer provider, rereads the source worksheet, re-runs recognition, and returns a short-lived preview record. The preview is not permission to write until the teacher explicitly confirms. The server stores only the source fingerprint, answer snapshot digest, teacher/activity identity, and expiration; it does not persist answer parts.

Response `201`:

```json
{
  "previewId": "opaque-id",
  "items": [{
    "questionNumber": 1,
    "winningGroupName": "Blue",
    "answerParts": ["part A", "part B"],
    "blankCount": 2,
    "targetLabels": ["Question 1, blank 1", "Question 1, blank 2"],
    "status": "ready"
  }]
}
```

Questions without a winner return `status: "no_winner"` and no answer parts. Answer-part/blank-count mismatch returns `status: "part_count_mismatch"`; unknown or changed structure returns an error requiring a new import/preview. Do not return sheet cell text other than the answers needed for preview.

## Confirm Export

### `POST /api/activities/{activityId}/guided-notes/exports`

Request:

```json
{ "previewId": "opaque-id" }
```

The server validates that the preview belongs to the same activity, teacher, source, and current structure, and that the current answer result digest still matches the preview. It re-reads target cells to ensure they remain blank, then sends valid updates in one Google `spreadsheets.batchUpdate` request. No-winner and mismatched questions remain unchanged and are listed in the response. A definite batch error reports all batch writes failed; uncertain network results trigger a read/reconciliation before any retry. The API has no conditional compare-and-swap for these cells, so simultaneous external edits are unsupported; a post-write readback detects and reports an observed conflict.

Response `200`:

```json
{
  "exportId": "opaque-id",
  "status": "completed",
  "writtenQuestionNumbers": [1],
  "unchangedQuestionNumbers": [2],
  "failedQuestionNumbers": []
}
```

Errors include `409 ACTIVITY_NOT_ENDED`, `409 PREVIEW_EXPIRED`, `409 ANSWERS_CHANGED`, `409 SOURCE_CHANGED`, `409 TARGET_NO_LONGER_BLANK`, `403 SHEETS_WRITE_DENIED`, `502 SHEETS_WRITE_FAILED`, and `503 EXPORT_OUTCOME_UNKNOWN`. Never return success while an outcome is unknown. `503 EXPORT_OUTCOME_UNKNOWN` includes the export id so the client can query status.

### `GET /api/activities/{activityId}/guided-notes/exports/{exportId}`

Returns the persisted attempt status and question-number outcome lists. For `unknown`, the server may reconcile by rereading current target cells before allowing another write. It never retries a write automatically when the prior outcome is uncertain.

Response `200`:

```json
{
  "exportId": "opaque-id",
  "status": "completed | failed | unknown",
  "writtenQuestionNumbers": [1],
  "unchangedQuestionNumbers": [2],
  "failedQuestionNumbers": []
}
```

## Answer Provider Contract

The later answer subfeature must provide a server-side function with this logical result for each question:

```ts
type WinningAnswerResult =
  | { questionNumber: number; winner: false }
  | { questionNumber: number; winner: true; winningGroupId: string; winningGroupName: string; answerParts: string[] };
```

For every `winner: true`, `answerParts.length` must equal that question's detected `blankCount` or the question is skipped and reported. Answer submission, correctness adjudication, scoring, and winner selection remain outside this feature.
