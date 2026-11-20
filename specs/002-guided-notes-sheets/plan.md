# Implementation Plan: Guided Notes 匯入與匯出

**Branch**: `002-guided-notes-sheets` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification, service-account authorization choice, the two user-provided `.xlsx` Guided Notes samples, and the requested TypeScript / React / Express / SQLite / WebSocket / Vitest stack.

## Summary

Extend the existing local quiz-buzzer application with teacher-led Google Sheets Guided Notes import and post-activity answer export. The server uses Google's officially supported Node.js API client with a service account configured only by environment variables. The teacher shares each source spreadsheet with that account. Import reads the selected worksheet, recognizes question numbers and blank slots using deterministic patterns derived from teacher-provided sample documents, and atomically stores the activity's question list plus the dynamically detected mapping. The first supplied workbook establishes a table layout with a `題號`/`題目`/`作答` header, decimal section labels, merged prompt regions, and one or two ordered answer slots per numbered section. The second supplied workbook establishes a distinct single-row question layout with one merged answer slot per question. These two sample-backed patterns are verified; additional layouts require additional samples. Unknown or ambiguous layouts fail closed; fixed question-to-cell coordinates are forbidden.

After the activity ends, the application obtains each question's winning group and ordered answer parts from a separate answer subfeature. It re-reads and re-recognizes the source sheet, presents a teacher-confirmed preview, and writes only valid answer parts to the corresponding blank cells. No-winner questions remain unchanged. A single confirmed set of valid target updates is sent as one Google Sheets batch; local SQLite state records the export attempt and result. SQLite and Google Sheets cannot participate in one transaction, so uncertain API outcomes must be reconciled against the source before retrying.

The component, class, and sequence PlantUML diagrams in `./diagrams/` are the primary architecture blueprints. This feature uses no WebSocket channel for sheet contents or edits; existing WebSocket phase synchronization remains owned by the first subfeature.

## Technical Context

**Language/Version**: TypeScript; Node.js >=22.12, matching the existing workspace.  
**Package Management**: Existing npm workspaces and root lockfile.  
**Primary Dependencies**: Existing React, Vite, Tailwind CSS, Express, `better-sqlite3`, `ws`, TypeScript, and Vitest; add Google's officially supported `googleapis` Node.js client to the server workspace.  
**Storage**: Existing SQLite database; add a migration for activity questions, Guided Notes source/mapping metadata, and export attempts.  
**Testing**: Vitest unit tests for layout recognition and answer-to-blank mapping; API/SQLite integration tests with a fake Sheets gateway; acceptance tests using at least two user-provided sample layouts. No live Google credentials are required in automated tests.  
**Target Platform**: Same-device local browser views; the Express service remains bound to `127.0.0.1`. Google Sheets calls originate only from the Node service.  
**Project Type**: Existing TypeScript npm monorepo with React client, Express service, and shared contracts.  
**Performance Goals**: A teacher can complete a valid import and confirm the question list within the spec's 2-minute target. Google requests use selective reads and batched writes to avoid unnecessary calls.  
**Constraints**: One Guided Notes source per activity; teacher selects the worksheet; import creates the activity question list; if question data already exists its count must match. Layout patterns must be derived from several sample sheets supplied by the user; no general semantic detector is assumed. Before export, re-read the sheet, re-detect structure, and request renewed confirmation after a structural change. The separate answer subfeature supplies a winning group and ordered answer parts for each question. Blank-count/answer-part mismatches skip that question and are reported. A no-winner question remains unchanged. Export requires an ended activity and explicit teacher confirmation. No live Sheets editing or synchronization is introduced.  
**Security**: Configure `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` only in the server environment; include names with safe placeholders in root `.env.example`, and keep `.env` ignored. Do not send credentials to the browser, log credentials, spreadsheet cell contents, or raw Google errors. The teacher shares each source sheet with the service-account email. Use `https://www.googleapis.com/auth/spreadsheets` for read/write operations; do not request broader Google Drive scopes. A dedicated service account limits the app's access to files explicitly shared with that account.  
**Scale/Scope**: One local teacher and one class activity at a time, with the normal Guided Notes worksheet size defined by supplied examples. No multi-device hosting, account registration, or collaborative/live editing.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan check |
|---|---|
| I. Validated Inputs and Clear Errors | Pass: validate activity/session ownership, spreadsheet URL or ID, worksheet selection, question labels, blank mappings, answer-part counts, and every transition; map Google failures to clear sanitized errors. |
| II. Secret Handling | Pass: server-only service-account environment variables, root `.env.example` placeholders, `.env` ignored, and allowlisted logs that exclude credentials, worksheet values, and raw API errors. |
| III. Evidence-Based Testing | Pass: Vitest normal and boundary coverage for import, dynamic detection, count mismatch, no winner, multiple blanks, permission failures, and uncertain writes; completion report records exact commands and results. |
| IV. Attributed Dependencies and Materials | Pass: record the official Google Node client source/license and all existing package licenses in `THIRD_PARTY_NOTICES.md`; attribute or sanitize user-provided test samples as agreed before committing fixtures. |
| V. Verifiable Behavior | Pass: server operations persist question/mapping data and perform writes through a mockable Sheets gateway and verified Google batch operation; the client is not a mockup. |
| VI. Clear Structure and Consistent Data | Pass: keep Google I/O in an adapter, recognition in a deterministic parser, local state in SQLite repositories, and use transactions only for local state; represent remote export status explicitly. |
| VII. Subfeature-Based Delivery | Pass: plan and implementation remain in `002-guided-notes-sheets` branch and feature directory; answer collection/winner determination remain a separate subfeature contract. |
| VIII. Design-First with PlantUML | Pass: component, class, and sequence diagrams are the architecture source for import, recognition, review, external access, and export boundaries; all three PNGs exist beside their sources. |

No constitution exceptions are required. Both attached workbooks have been inspected and provide two concrete layout patterns with different question and blank positions; additional representative samples are needed before claiming support for other patterns. The answer subfeature must honor the ordered answer-parts contract.

## Research Decisions

Research conclusions and primary sources are recorded in [research.md](research.md). Key decisions:

- Use the Google-supported `googleapis` Node.js client and a server-side service account. A service account can access only files shared with its email; do not enable domain-wide delegation.
- Read spreadsheet and worksheet metadata with field masks; request only relevant grid fields and ranges. Google Sheets exposes values, formats, notes, and formulas but does not semantically identify questions or blanks.
- Use deterministic sample-derived layout patterns, including the multi-row numbered-slot and single-row merged-slot layouts described in [research.md](research.md). Store detected coordinates as per-import results, never as hard-coded question-to-cell rules. Re-read and re-detect immediately before writeback.
- Apply a validated group of writes using `spreadsheets.batchUpdate` and `UpdateCellsRequest`, setting only `userEnteredValue` so existing formatting remains intact. The batch is atomic at Google's request level, but it is not atomic with SQLite and cannot prevent all concurrent human edits.
- Never keep a SQLite write transaction open during network calls. Import remote read/parse first, then persist the question list and mappings in one short transaction. For export, persist an attempt, call Google, and record/reconcile the result separately.
- Use a fake gateway for tests; use sample-backed acceptance fixtures only after the user supplies those documents.

## Architecture Derived from PlantUML

The three diagrams are the primary blueprint for the implementation:

- [Component diagram](../../diagrams/002-guided-notes-sheets-component.puml) and [PNG](../../diagrams/002-guided-notes-sheets-component.png): the local teacher interface calls a Guided Notes workflow; the workflow separates structure recognition, answer-result lookup, review/confirmation, Google Sheets access, and local metadata persistence. The server owns all external API calls.
- [Class diagram](../../diagrams/002-guided-notes-sheets-class.puml) and [PNG](../../diagrams/002-guided-notes-sheets-class.png): maintain the relationship between `ActivityQuestion`, per-question blank mappings, a source document, winning answer parts, preview, and export result. Detected positions are associated with the selected worksheet and structure version.
- [Sequence diagram](../../diagrams/002-guided-notes-sheets-sequence.puml) and [PNG](../../diagrams/002-guided-notes-sheets-sequence.png): import reads and recognizes the selected worksheet before committing local question/mapping data; post-end export retrieves answers, re-reads/re-recognizes the sheet, previews, waits for teacher confirmation, then performs the batch write and records a truthful result.

The diagrams intentionally model structure detection as a component boundary. The two supplied workbooks establish the currently verified multi-row numbered-slot and single-row merged-slot patterns. Do not claim support for additional patterns until more samples are supplied and analyzed; unknown or ambiguous layouts remain fail-closed.

## Planned Flows and Consistency

### Import

1. The teacher submits a Google Sheets URL or spreadsheet ID; the service validates/extracts only the spreadsheet ID and does not fetch arbitrary user-provided URLs.
2. The service uses its environment-configured service account to retrieve spreadsheet metadata and worksheet choices. The teacher selects one worksheet by `sheetId`.
3. The Sheets adapter fetches only selected grid values and metadata needed by the recognized sample patterns.
4. The deterministic recognizer produces ordered question numbers, ordered blank slots for each question, and a structural fingerprint. Unknown, missing, or ambiguous labels/slots fail closed.
5. If activity questions already exist, validate the imported count before changing local state. If none exist, create the list from the sheet's recognized question numbers.
6. In one short SQLite transaction, persist the question list if new, selected source IDs, fingerprint, and dynamic mappings. Any local error rolls back all local import changes. No remote write occurs during import.

### Export

1. Require the activity phase to be `已結束` and the requesting session to be the activity's teacher.
2. Ask the answer-results provider for each question's winning group and ordered answer parts. No-winner questions have no write target.
3. Read the source sheet again, re-run recognition, verify the structure fingerprint and that target cells remain blank, and create a preview. Structural changes require a new mapping/review; occupied target cells require correction rather than overwrite.
4. Validate that answer-part count equals blank-slot count for each question. Report mismatched questions; exclude them from the valid batch while preserving their source cells.
5. Persist an export attempt with preview/source fingerprint, then send all valid cell updates in one `spreadsheets.batchUpdate` using only `userEnteredValue` fields. If no valid updates exist, do not call the write API.
6. Record success/failure locally. If the network result is uncertain, re-read target cells and reconcile before any retry; never blindly repeat a potentially completed write. A Google batch failure is reported as failed for the batch; the system does not claim a partial success.

SQLite state and the remote spreadsheet cannot share an atomic transaction. Export attempts therefore have explicit `pending`, `completed`, `failed`, and `unknown` states, and the UI must distinguish a confirmed write from an uncertain response. Google does not provide a compare-and-swap write for these cells: a collaborator edit in the short interval after final validation cannot be fully prevented. The feature does not support simultaneous editing; re-read targets immediately before sending, verify after sending, and surface any conflict for teacher review.

## Project Structure

### Documentation (this feature)

```text
specs/002-guided-notes-sheets/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-contracts.md
│   └── ui-contracts.md
├── checklists/requirements.md
└── tasks.md                         # Created by $speckit-tasks

diagrams/
├── 002-guided-notes-sheets-component.puml / .png
├── 002-guided-notes-sheets-class.puml / .png
└── 002-guided-notes-sheets-sequence.puml / .png
```

### Source Code (repository root)

```text
client/src/features/guided-notes/
├── components/                      # import, worksheet, preview, result views
├── services/                        # typed local HTTP client
└── views/                            # teacher import/export flow

server/src/features/guided-notes/
├── api/                              # validated import/preview/export routes
├── application/                      # orchestration, phase/role guards
├── domain/                           # sample-derived layout recognition
├── google-sheets/                    # official client adapter, no UI coupling
└── persistence/                      # SQLite repositories

shared/src/guided-notes/              # request/response and answer-provider contracts
server/src/config/env.ts              # validate service-account env names/values
.env.example                          # safe placeholders only; no real credentials
THIRD_PARTY_NOTICES.md                # add googleapis provenance and license
tests/unit/guided-notes/              # recognizer and ordered answer mapping
tests/integration/guided-notes/       # Express/SQLite with fake Sheets gateway
tests/acceptance/guided-notes/        # fixtures derived from supplied samples
```

**Structure Decision**: Extend the existing npm-workspace monorepo using a new `guided-notes` feature boundary in the client, server, and shared package. Keep the API client/server adapter isolated from domain recognition and UI. Add the next SQLite migration after the existing user-stage-sync schema; do not modify the previous feature's migrations or tests.

**Migration Chain**: The existing server currently loads a single migration from `server/src/features/user-stage-sync/persistence/migrations/001-user-stage-sync.sql`. Add the Guided Notes schema as `002-guided-notes-sheets.sql` in that shared ordered chain, update the loader and build copy script to apply/package both migrations, and leave migration 001 unchanged.

## Phase 0: Research

Completed. See [research.md](research.md). Both attached workbooks have been inspected read-only and establish the currently verified multi-row numbered-slot and single-row merged-slot patterns. Implementation must not invent additional layout rules; unknown patterns must fail closed.

## Phase 1: Design & Contracts

Completed in [data-model.md](data-model.md), [API contracts](contracts/api-contracts.md), [UI contracts](contracts/ui-contracts.md), and [quickstart.md](quickstart.md). These define the import/export data, service-account boundary, API operations, safe failure behavior, and repeatable validation scenarios.

## Complexity Tracking

No constitution violations or extra projects are proposed. The local Google API adapter is required by the requested external integration; it remains within the existing server workspace.
