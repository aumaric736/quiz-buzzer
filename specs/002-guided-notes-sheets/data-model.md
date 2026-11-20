# Data Model: Guided Notes 匯入與匯出

This model follows [the feature class diagram](../../diagrams/002-guided-notes-sheets-class.puml). SQLite is authoritative for activity questions, the source worksheet identity, detected mapping metadata, and local export state. Google Sheets remains authoritative for the original Guided Notes content. Credentials are never persisted in SQLite.

## Entities

### ActivityQuestion (`activity_questions`)

Represents a numbered question in an activity. The first successful Guided Notes import creates the list. The later answer subfeature consumes these identifiers.

| Field | Required | Validation / meaning |
|---|---|---|
| `id` | Yes | Opaque local identifier. |
| `activityId` | Yes | Existing activity foreign key. |
| `questionNumber` | Yes | Positive integer parsed from a supported sample layout; unique within activity. |
| `createdAt` | Yes | Local creation timestamp. |

**Uniqueness**: `(activityId, questionNumber)` is unique. If activity questions already exist, import compares question count before modifying the existing set. A mismatch leaves the prior list and document mapping unchanged.

### GuidedNotesSource (`guided_notes_sources`)

Represents the original sheet selected for an activity.

| Field | Required | Validation / meaning |
|---|---|---|
| `id` | Yes | Opaque local mapping identifier. |
| `activityId` | Yes | One source Guided Notes per activity. |
| `spreadsheetId` | Yes | Validated identifier parsed from the user-supplied Sheets URL or ID. Not a credential. |
| `sheetId` | Yes | Numeric worksheet id chosen by the teacher. |
| `sheetTitle` | Yes | Current display title for the selected worksheet. |
| `structureFingerprint` | Yes | Hash of the detected question/blank structure, not a hash of all cell text. |
| `importedAt` | Yes | Last successful import time. |
| `updatedAt` | Yes | Last successful source/mapping update. |

### QuestionBlankMapping (`guided_notes_blank_mappings`)

Stores the dynamic result of recognition for one activity question. Coordinates are detected from the selected source document on each import and are never fixed in application logic.

| Field | Required | Validation / meaning |
|---|---|---|
| `sourceId` | Yes | Foreign key to the selected Guided Notes source. |
| `questionNumber` | Yes | Foreign key to the activity's question number. |
| `slotOrder` | Yes | Zero-based order of a blank within the question, based on the supported sample pattern's reading order. |
| `rowIndex` | Yes | Non-negative, zero-based grid row returned by Sheets. |
| `columnIndex` | Yes | Non-negative, zero-based grid column returned by Sheets. |
| `blankKind` | Yes | Recognized blank signal/pattern identifier, used for revalidation. |

**Uniqueness**: `(sourceId, questionNumber, slotOrder)` and `(sourceId, rowIndex, columnIndex)` are unique. Each question has one or more slots to be eligible for an answer write.

### WinningAnswerProvider Result (external feature contract)

Not persisted by this feature. The answer subfeature supplies the activity's per-question winning group and ordered answer parts after the activity ends.

| Field | Required | Validation / meaning |
|---|---|---|
| `activityId` | Yes | Must match the requested activity. |
| `questionNumber` | Yes | Must match an imported `ActivityQuestion`. |
| `winningGroupId` | Yes when winner exists | Successful group identifier. |
| `winningGroupName` | Yes when winner exists | Display value for teacher preview. |
| `answerParts` | Yes when winner exists | Ordered non-empty strings; count must equal detected blank slots for the question. |
| `winner` | Yes | False means do not write any value for the question. |

### ExportAttempt (`guided_notes_export_attempts`)

Tracks a teacher-confirmed attempt to write answers back to the source sheet.

| Field | Required | Validation / meaning |
|---|---|---|
| `id` | Yes | Opaque export/preview identifier. |
| `activityId` | Yes | Existing activity foreign key. |
| `createdBySessionId` | Yes | Must be the teacher who owns the activity. |
| `status` | Yes | `previewed`, `pending`, `completed`, `failed`, or `unknown`; transitions are constrained below. |
| `sourceFingerprint` | Yes | Structure fingerprint used to generate the preview. |
| `answerSnapshotHash` | Yes | Digest of ordered winning-answer results shown in the preview; answer text itself is not persisted by this feature. |
| `previewExpiresAt` | Yes | Expiration time; confirmation after expiry requires a fresh preview. |
| `writtenQuestionNumbers` | Yes | Serialized stable list of confirmed questions whose batch succeeded. |
| `unchangedQuestionNumbers` | Yes | Questions with no winner. |
| `failedQuestionNumbers` | Yes | Questions skipped for mismatch/recognition errors or whose batch failed. |
| `createdAt` / `updatedAt` | Yes | Attempt lifecycle timestamps. |

Export attempt records contain no service-account credential, answer payload, or raw Google API response body. The preview returns answer parts only to the local teacher view. On confirmation, the server reloads answer results and compares their digest to `answerSnapshotHash`; changed answers require a fresh preview. The answer values are not persisted by this feature.

## Relationships

- One activity has zero or more numbered questions.
- One activity has at most one imported Guided Notes source.
- One source has one or more detected blank slots for each question.
- One question may have zero or one winning group result from the answer subfeature for an activity run.
- One export attempt belongs to one activity and teacher session and reports per-question write outcomes.

## Import Invariants and Transactions

1. Validate local session role and activity ownership before external work.
2. Fetch worksheet metadata/grid data through the server-side adapter; recognize every supported question and blank before local writes.
3. Reject duplicate/missing question numbers, missing blank slots, unknown or ambiguous layouts, and any mismatch with an existing activity question count.
4. If no activity questions exist, insert question numbers from the recognized sheet. Otherwise preserve existing question rows.
5. Replace the selected source and all mapping rows in a single short SQLite transaction. Roll back all local writes on any failure.
6. Do not modify the Google sheet during import.

## Export Lifecycle

| Current status | Operation | Next status |
|---|---|---|
| none | Build preview for ended activity and current sheet | `previewed` |
| `previewed` | Teacher confirms; structure/fingerprint and blanks still match | `pending` |
| `previewed` | Teacher cancels | No remote write; preview can expire locally. |
| `pending` | Google batch succeeds and response verified | `completed` |
| `pending` | Google returns a definite rejected batch | `failed` |
| `pending` | Connection fails with uncertain write outcome | `unknown` until target values are re-read/reconciled. |
| `unknown` | Re-read proves all intended values applied | `completed` |
| `unknown` | Re-read proves no intended values applied and cells are still safe | Return to teacher confirmation before retry. |
| `unknown` | Mixed/changed/ambiguous state | `failed`; require teacher review, never blindly retry. |

The app re-reads and re-detects the selected sheet before writeback. It writes only to currently blank targets whose number and ordered blank mapping still match. A source structural change requires fresh recognition and a new preview. A target cell changed to a nonblank value after preview is not overwritten.

## Local Security Boundary

The service account is a server configuration, not a user or activity record. Only the Google server adapter receives credential material from `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`. The browser receives neither. The teacher's local session/role checks are simulation behavior, not Google identity verification. Spreadsheet ids and cell text must not appear in routine logs.
