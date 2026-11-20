---
description: "Dependency-ordered implementation tasks for Guided Notes import and export"
---

# Tasks: Guided Notes 匯入與匯出

**Input**: Design artifacts in `specs/002-guided-notes-sheets/` and the architecture diagrams in `diagrams/`.

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.

**Organization**: Tasks are grouped by user story. All three stories are priority P1. The implementation order places preview (US3) before writeback (US2), because export confirmation depends on the preview contract.

**Testing**: Vitest normal and boundary tests are required by the project constitution. Automated Sheets tests must use a fake gateway and must not require real credentials.

## Phase 1: Setup

**Purpose**: Add shared Google Sheets integration dependency and establish the feature folder structure.

- [X] T001 [P] Add the official `googleapis` dependency to `server/package.json` and `package-lock.json`, and record its source and license in `THIRD_PARTY_NOTICES.md`.
- [X] T002 Add `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY` validation in `server/src/config/env.ts`, safe placeholder names in `.env.example`, and verify `.gitignore` excludes `.env` without logging credential values.
- [X] T003 [P] Add the client, server, and shared feature barrel exports in `client/src/features/guided-notes/index.ts`, `server/src/features/guided-notes/index.ts`, and `shared/src/guided-notes/index.ts` following the boundaries in `diagrams/002-guided-notes-sheets-component.puml`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared contracts, persistence invariants, Google gateway boundary, and sanitized feature errors before user-story work.

- [X] T004 Define import, worksheet, mapping, preview, export-status, and winning-answer-provider TypeScript contracts in `shared/src/guided-notes/contracts.ts` and export them from `shared/src/index.ts`.
- [X] T005 [P] Add `server/src/features/user-stage-sync/persistence/migrations/002-guided-notes-sheets.sql` for `activity_questions`, `guided_notes_sources`, `guided_notes_blank_mappings`, and `guided_notes_export_attempts`; enforce “questionNumber: Positive integer ... unique within activity,” “slotOrder: Zero-based,” “rowIndex/columnIndex: Non-negative,” uniqueness `(activityId, questionNumber)`, `(sourceId, questionNumber, slotOrder)`, `(sourceId, rowIndex, columnIndex)`, and one source per activity. Update `server/src/features/user-stage-sync/persistence/database.ts` to apply migrations in order and `server/scripts/copy-migrations.mjs` to copy both SQL files without editing migration 001.
- [X] T006 [P] Define the injectable `SheetsGateway` interface and typed provider error boundary in `server/src/features/guided-notes/google-sheets/sheets-gateway.ts`, keeping credentials and Google client details out of domain and client code.
- [X] T007 Add database migration and Google environment validation normal/boundary coverage in `tests/integration/guided-notes/schema.test.ts` and `tests/unit/guided-notes/config.test.ts`.

**Checkpoint**: Shared contracts, schema, configuration, and adapter boundaries are ready; no real Google credentials are needed for tests.

---

## Phase 3: User Story 1 - 老師匯入 Guided Notes (Priority: P1)

**Goal**: Discover a teacher-shared spreadsheet, recognize its questions and ordered blank slots dynamically, and create the activity question list transactionally.

**Independent Test**: Import the supplied sample layout and a position-shifted fixture with the same evidenced structural pattern; verify the expected question list and blank counts. Verify unknown/ambiguous layouts, missing blanks, invalid input, permission errors, and existing-question-count mismatch fail clearly and do not leave partial local state.

### Tests for User Story 1

- [X] T008 [P] [US1] Add normal, position-shifted, duplicate-question, missing-blank, and ambiguous-layout recognition cases in `tests/unit/guided-notes/layout-recognizer.test.ts`, using minimized fixtures derived from the supplied workbook and no copied prompt text.
- [X] T009 [P] [US1] Add import API integration cases for worksheet access, invalid IDs, permission denial, existing-question-count mismatch, and rollback/no-partial-mapping behavior in `tests/integration/guided-notes/import-api.test.ts` with a fake Sheets gateway.

### Implementation for User Story 1

- [X] T010 [P] [US1] Implement the sample-backed deterministic layout recognizer in `server/src/features/guided-notes/domain/layout-recognizer.ts`; detect question labels and ordered blanks from validated headers, grouping/merge structure, and blank markers without encoding sample cell coordinates.
- [X] T011 [P] [US1] Implement the SQLite repositories for questions, source documents, and blank mappings in `server/src/features/guided-notes/persistence/guided-notes-repository.ts`; persist a successful import atomically and preserve existing questions when the count matches.
- [X] T012 [P] [US1] Implement Google Sheets worksheet discovery and selected-grid reads in `server/src/features/guided-notes/google-sheets/google-sheets-gateway.ts` using the server environment service account, narrow field masks, sanitized errors, and no sensitive logging.
- [X] T013 [US1] Implement import orchestration and validation in `server/src/features/guided-notes/application/import-guided-notes.ts`; validate local teacher ownership, supported Sheets URL/ID, selected worksheet, recognition result, and question count before local persistence.
- [X] T014 [US1] Add worksheet discovery and Guided Notes import routes with stable error codes in `server/src/features/guided-notes/api/guided-notes-routes.ts` and register the router in `server/src/app.ts`.
- [X] T015 [P] [US1] Build the teacher worksheet-selection and import view in `client/src/features/guided-notes/views/GuidedNotesImportView.tsx`, its typed HTTP service in `client/src/features/guided-notes/services/guided-notes-api.ts`, and integrate it in `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`; show question numbers/counts and actionable errors without worksheet prompt text or credentials.

**Checkpoint**: A valid worksheet import creates question and mapping state once; all invalid or unsupported input leaves local state unchanged.

---

## Phase 4: User Story 3 - 老師檢查並確認題目對應 (Priority: P1)

**Goal**: Let the teacher inspect a short-lived per-question preview of winner answers and their dynamically detected target slots, and cancel without changing the source sheet.

**Independent Test**: With an ended activity and fake answer-provider results, verify ordered answers/slots and no-winner or part-count-mismatch states; verify an active activity is rejected, expired or changed previews are invalidated, and cancellation makes no Sheets write call.

### Tests for User Story 3

- [X] T016 [P] [US3] Add preview service/API tests for ended-phase enforcement, answer-provider completeness, preview expiry metadata, winner/no-winner items, source changes, and answer-part/blank-count mismatch in `tests/integration/guided-notes/export-preview.test.ts` using fake answer and Sheets providers.
- [X] T017 [P] [US3] Add client tests for ready, no-winner, mismatch, and cancel-without-write preview states in `tests/acceptance/guided-notes/export-preview.test.tsx`.

### Implementation for User Story 3

- [X] T018 [P] [US3] Implement the typed answer-provider adapter and preview builder in `server/src/features/guided-notes/application/build-export-preview.ts`; require an ended activity, re-read/re-recognize the sheet, compare ordered part counts, and store only source/answer digests plus expiry (never answer payloads).
- [X] T019 [US3] Add export-preview route validation and response mapping in `server/src/features/guided-notes/api/guided-notes-routes.ts`, returning human-readable target labels without exposing sheet cell contents.
- [X] T020 [P] [US3] Build the teacher preview and cancel/confirm controls in `client/src/features/guided-notes/views/GuidedNotesExportPreview.tsx`; do not invoke the write endpoint on preview creation or cancellation.

**Checkpoint**: Teacher can inspect a current preview and cancel it without remote or local source changes.

---

## Phase 5: User Story 2 - 老師將成功組別答案寫回原文件 (Priority: P1)

**Goal**: After teacher confirmation, write eligible ordered answers into only the recognized blank cells, preserving no-winner, mismatched, and unrelated cells and reconciling uncertain remote outcomes.

**Independent Test**: Confirm an export in the fake Sheets gateway and verify only the exact dynamically recognized targets changed. Cover no-winner and count-mismatch skips, occupied targets, changed structure, permission/write failures, and timeout reconciliation without blind retry or false success.

### Tests for User Story 2

- [X] T021 [P] [US2] Add tests for target-only batch updates, no-winner preservation, per-question part mismatch, occupied targets, definite write denial, and post-write verification in `tests/integration/guided-notes/export-confirmation.test.ts`.
- [X] T022 [P] [US2] Add uncertain-outcome reconciliation tests proving applied, unapplied, and mixed remote writes transition to truthful persisted statuses in `tests/integration/guided-notes/export-reconciliation.test.ts`.

### Implementation for User Story 2

- [X] T023 [P] [US2] Implement batched writes and target-cell reread support in `server/src/features/guided-notes/google-sheets/google-sheets-gateway.ts`; update only `userEnteredValue` for dynamic blank mappings and preserve formatting.
- [X] T024 [P] [US2] Implement confirmation, source/answer/fingerprint revalidation, export-attempt state transitions, and uncertain-write reconciliation in `server/src/features/guided-notes/application/confirm-guided-notes-export.ts` and `server/src/features/guided-notes/persistence/export-attempt-repository.ts`.
- [X] T025 [US2] Add export confirmation and status routes in `server/src/features/guided-notes/api/guided-notes-routes.ts`; reject changed/expired previews and never report success for unknown outcomes.
- [X] T026 [P] [US2] Implement export result states and safe retry guidance in `client/src/features/guided-notes/views/GuidedNotesExportResult.tsx`, including written, unchanged, skipped, failed, and unknown questions.

**Checkpoint**: Only confirmed and revalidated answer slots are written; all other cells remain intact and uncertain writes are reconciled before retry.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete sample-backed acceptance coverage, docs, attribution, security checks, and diagram alignment.

- [X] T027 Add a second teacher-provided sample with different question and blank positions as a minimized structural fixture in `tests/acceptance/guided-notes/sample-layouts.test.ts`; document observed pattern signals and provenance in `specs/002-guided-notes-sheets/research.md` before claiming the second layout is supported. Both patterns are tested at source and shifted coordinates, confirming the recognizer does not depend on fixed positions.
- [X] T028 Verify the implementation's components, entities, and import/preview/confirm sequences against `diagrams/002-guided-notes-sheets-component.puml`, `diagrams/002-guided-notes-sheets-class.puml`, and `diagrams/002-guided-notes-sheets-sequence.puml`; update diagram source and render PNGs if implementation intentionally changes the architecture.
- [X] T029 Update `specs/002-guided-notes-sheets/quickstart.md` and `THIRD_PARTY_NOTICES.md` with the actual setup, exact test/build commands, supported sample layouts, package sources/licenses, and manual Google Sheets acceptance steps.
- [X] T030 Run the `npm test` and `npm run build` commands defined in root `package.json`, record exact command results, and resolve all failures before reporting completion.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 and blocks all user-story implementation.
- **US1 (Phase 3)**: Depends on the foundational contracts, schema, environment configuration, and gateway boundary.
- **US3 (Phase 4)**: Depends on US1's source/mapping data and the answer-provider contract.
- **US2 (Phase 5)**: Depends on US1's recognized mappings and US3's preview/confirmation contract.
- **Polish (Phase 6)**: Depends on all story implementation; T027 was completed after the user supplied the second sample and both sample patterns passed acceptance tests.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; establishes question and source mappings.
- **US3 (P1)**: Starts after US1; builds a reviewable export preview and no-write cancellation path.
- **US2 (P1)**: Starts after US1 and US3; confirms and writes the previewed results.

### Parallel Opportunities

- T001 and T003 can run in parallel after checking existing workspace configuration.
- T005 and T006 can run in parallel after T004's shared contract names are agreed; T007 follows T005/T002.
- In US1, T008 and T009 are parallel test authoring tasks; after the foundation, detector, repository, adapter, and view tasks touch separate files and can proceed in parallel where their interfaces are stable.
- In US3, T016 and T017 can be authored in parallel; service and client work can proceed in parallel after the preview contract is fixed.
- In US2, T021 and T022 can be authored in parallel; gateway, orchestration/repository, and UI changes can proceed in parallel after confirmation/status contracts are fixed.
- The user stories themselves are sequential because each consumes the previous story's persisted contract and flow.

## Parallel Example: User Story 1

```text
Task: T008 Implement recognizer normal/boundary tests in tests/unit/guided-notes/layout-recognizer.test.ts
Task: T009 Implement import API integration tests in tests/integration/guided-notes/import-api.test.ts
```

## Parallel Example: User Story 3

```text
Task: T016 Implement preview service/API tests in tests/integration/guided-notes/export-preview.test.ts
Task: T017 Implement client preview/cancel tests in tests/acceptance/guided-notes/export-preview.test.tsx
```

## Parallel Example: User Story 2

```text
Task: T021 Implement export confirmation tests in tests/integration/guided-notes/export-confirmation.test.ts
Task: T022 Implement uncertain outcome reconciliation tests in tests/integration/guided-notes/export-reconciliation.test.ts
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 to deliver verified dynamic import and activity question creation.
3. **Stop and validate** with `npm test`; do not start the next story until US1 normal and boundary tests pass.
4. Complete US3; validate preview, mismatch, no-winner, expiry, and cancel behavior.
5. Complete US2; validate target-only writes and uncertain outcome reconciliation.
6. T027 is complete for the two supplied sample patterns; require another sample before claiming support for any additional layout pattern.

### Incremental Delivery

Deliver US1 first as the import MVP. Add the preview flow in US3, then teacher-confirmed writeback in US2. Run the feature tests at each checkpoint and keep Google API calls behind the fakeable gateway for deterministic test coverage.

## Format Validation

Every executable task uses `- [ ] Tnnn`, an optional `[P]`, a required `[USn]` only in story phases, and at least one exact repository file path.

## Phase 7: Convergence

- [ ] T031 Finish wiring the production `WinningAnswerProvider` into `server/src/app.ts` when the answer-results subfeature provides its implementation. The app-level dependency injection and fake-provider integration test are in place; the real provider/data model is absent, so retain the explicit unavailable error until it can be supplied per FR-006 (partial).
- [X] T032 Add a two-sample write-through acceptance test using `tests/acceptance/guided-notes/sample-layouts.test.ts` and `tests/integration/guided-notes/export-confirmation.test.ts`; import each sample, confirm ordered answers, and assert only dynamically detected blank targets change per SC-002 / US2-AC1 (partial).
- [X] T033 Reconcile sample-count, provenance, and supported-layout statements in `specs/002-guided-notes-sheets/plan.md` with the two inspected samples and their acceptance evidence per plan: sample coverage (partial).
