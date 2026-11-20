# Research: Guided Notes 匯入與匯出

## Decision 1: Google Sheets access and credentials

**Decision**: Use Google's officially supported Node.js API client (`googleapis`) from the Express server only. Authenticate as a dedicated service account whose email and private key are loaded from server environment variables. The teacher shares the source Guided Notes with that account and grants viewer access for import or editor access for export. Do not use domain-wide delegation or send credentials to the React client.

**Rationale**: The teacher selected a service-account model, which suits this same-device simulation and avoids adding individual Google sign-in. Google documents service accounts for specific shared Sheets and their client library for Node.js. The service account's Drive contains only documents explicitly shared with it; no Drive-wide API scope is needed.

**Configuration**: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` (support escaped newline normalization). Add safe placeholder values to `.env.example`; the actual private key stays in ignored `.env` or another local environment manager. Use `https://www.googleapis.com/auth/spreadsheets` for read/write access; do not request Google Drive-wide access. Never log credentials, cell contents, or raw API errors.

**Alternatives considered**:

- Per-teacher OAuth: rejected for this local simulated-role feature; it introduces Google login, per-user token lifecycle, consent UX, and token storage not requested by the user.
- Public-link/API-key access: rejected because documents need write access and are not assumed public.
- Domain-wide delegation: rejected because individual file sharing to one service account is sufficient.

The selected Node.js client is distributed under Apache-2.0; record its official repository source and resolved package license in `THIRD_PARTY_NOTICES.md` when the dependency is added.

Sources: [Google credential types and service accounts](https://developers.google.com/workspace/guides/create-credentials), [official Google Node.js API client](https://github.com/googleapis/google-api-nodejs-client), [client license](https://github.com/googleapis/google-api-nodejs-client/blob/main/LICENSE), [Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes).

## Decision 2: Spreadsheet structure inspection and dynamic recognition

**Decision**: Fetch selected worksheet metadata and only the relevant grid data needed by a deterministic recognizer. Use Sheets `spreadsheets.get` with a field mask and selected ranges / grid data; use cell entered values, formatted values, formats, notes, or other observed fields only when the supplied examples demonstrate those as stable signals. Derive a small set of explicit supported patterns from several user-provided samples. Store the resulting sheetId, question number, ordered blank slots, and a structure fingerprint per import. Re-read and re-recognize before export. Stop when no pattern matches or multiple mappings are plausible.

**Rationale**: The Sheets API supplies worksheet and cell metadata but no Guided Notes semantic model. An empty cell alone does not reveal whether it is a fill-in blank. A sample-backed, fail-closed detector supports different layouts without hardcoding question 1 to a fixed address or assuming one document's coordinates apply to another.

**Alternatives considered**:

- Fixed cell coordinates / a question-number-to-cell table: rejected by the feature's explicit acceptance constraint.
- Guessing from any empty cell or whitespace: rejected because ordinary empty worksheet cells are not necessarily answer blanks and could be overwritten.
- LLM/AI visual interpretation: rejected as non-deterministic, difficult to validate and unnecessary for the supported sample patterns.

### User-provided sample inspection (2026-11-19)

The attached workbook `軟工期末專案_題組_範例.xlsx` was inspected read-only. It contains one worksheet (`學習單`) with a repeated table headed `題號`, `題目`, and `作答`. The first column uses decimal section labels (`1.0` through `4.0`) with merged cells spanning the rows belonging to the same question. Prompt text occupies merged cells in the `題目` column. In the first two sections, `G` contains visible slot labels `(1)` and `(2)` while the corresponding empty `H` cells are the answer targets; the last two sections each use one empty merged `G:H` answer cell. Thus the sample has four numbered questions and six answer slots, with two ordered slots each for questions 1 and 2. Existing merged ranges and cell formatting are structural signals; the detector must validate the table/header and grouped row pattern rather than reuse this workbook's coordinates. It must distinguish slot labels from answer targets and export only to verified blank targets.

The first sample establishes the multi-row question pattern with both numbered adjacent answer slots and single merged answer slots. Keep unknown or ambiguous layouts fail-closed. Do not commit either source workbook or its prompt contents into the repository; use minimized structural fixtures and avoid copying worksheet text.

The sample's observed content range is `B2:H13` on `學習單`; structural merged ranges include `B5:B6`, `B8:B9`, `C5:F6`, `C8:F9`, `G11:H11`, and `G13:H13`. These are sample observations, not production coordinates.

### Second user-provided sample inspection (2026-11-20)

The workbook `軟工期末專案_單題_範例.xlsx` contains one worksheet with the same `題號` / `題目` / `作答` header labels, but a different question arrangement: six question labels occur in separate single rows with spacer rows between them, each prompt occupies a merged prompt range, and each corresponding answer area is one empty merged range. The worksheet also has merged title/header and spacer rows. The minimized fixture in `tests/acceptance/guided-notes/sample-layouts.test.ts` retains only header values, question numbers, and merge coordinates; no prompt or title text is copied.

Both supplied samples pass the same recognizer without a sample-specific branch. The first pattern maps `(1)` / `(2)` labels to adjacent blank cells and supports questions spanning multiple rows; the second pattern maps one empty merged answer range per single-row question. The acceptance test shifts both fixtures by seven rows and three columns and confirms that detected target coordinates move by the same offsets, demonstrating the recognizer uses worksheet structure instead of fixed source positions. Additional unknown layouts remain fail-closed.

Sources: [Get spreadsheet and selected grid data](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/get), [CellData fields](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/cells), [read and write cell values](https://developers.google.com/workspace/sheets/api/guides/values).

## Decision 3: Export operation and consistency

**Decision**: After preview confirmation, re-read and validate the source, then issue one `spreadsheets.batchUpdate` containing `UpdateCellsRequest` entries for every valid target. Set only `userEnteredValue` so the existing format is retained. A question with no winning group remains untouched. Exclude a question whose ordered answer-part count differs from its detected blank count and report it. Record a local export attempt before the remote write and reconcile an uncertain API response by reading targets before retrying.

**Rationale**: Google validates the requests in a `spreadsheets.batchUpdate` batch and applies the batch atomically, making it safer than separate per-cell calls. Google also warns collaborative edits can affect the result. The Sheets service and local SQLite cannot share a distributed transaction, so the feature needs explicit pending/confirmed/unknown states and cannot blindly retry timeouts.

**Alternatives considered**:

- One request per cell: rejected due to more round trips and the possibility of partly written answers.
- Treating SQLite and Sheets as one transaction: impossible with the available local database and remote API.
- Blind retry after a timeout: rejected because the original request may already have been applied.

Sources: [Google `spreadsheets.batchUpdate`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [Google batch request behavior](https://developers.google.com/workspace/sheets/api/guides/batch), [API error troubleshooting](https://developers.google.com/workspace/sheets/api/troubleshoot-api-errors).

## Decision 4: Local transactions and error boundaries

**Decision**: Perform Google reads/parsing outside SQLite write transactions. After a valid import is fully recognized, one short local transaction creates question records if needed and stores the document and blank mappings; any database failure rolls all local import changes back. Export uses local attempt records around a separately executed Google request. Express routes map typed domain and provider failures into stable sanitized API errors.

**Rationale**: SQLite provides transactions and only one simultaneous writer. Holding a write lock while waiting on the network would increase contention without making the remote call atomic. Express 5 forwards rejected route promises to error handling, but application-owned error mapping is still required to avoid exposing provider details.

Sources: [SQLite transactions](https://www.sqlite.org/lang_transaction.html), [SQLite transactional guarantees](https://www.sqlite.org/transactional.html), [Express error handling](https://expressjs.com/en/guide/error-handling/).

## Decision 5: Test strategy

**Decision**: Keep automated tests fully offline by injecting a Sheets gateway. Test deterministic recognizer rules against fixtures derived from user samples; test API, SQLite and lifecycle behavior with a fake gateway. Cover denied service account access, missing worksheet, unknown/ambiguous patterns, question count mismatch, no winner, multi-blank answer mapping, answer-part count mismatch, structure change, write failure, rate limiting, and uncertain write reconciliation. Include a manual acceptance path with a real shared test sheet.

Sources: [Vitest guide](https://vitest.dev/guide/), [Vitest mocking](https://vitest.dev/guide/mocking).
