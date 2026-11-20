---
description: "Dependency-ordered task list for results review"
---

# Tasks: 課堂搶答結果檢視與檢討

**Input**: Design documents from `/specs/004-results-review/`

**Prerequisites**: `specs/004-results-review/plan.md`, `specs/004-results-review/spec.md`, `research.md`, `data-model.md`, `contracts/results-review-api.md`, and `quickstart.md`.

**Tests**: Required by the project constitution. Each story includes normal and boundary coverage using Vitest and persisted SQLite/Express behavior.

**Organization**: Tasks are grouped by user story after shared persistence prerequisites so each result view can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches a different file and has no unfinished dependency.
- **[Story]**: User story mapping from `spec.md` (US1, US2).
- Every task names the repository file or files it changes or verifies.

## Phase 1: Setup

**Purpose**: Confirm the existing workspaces and commands this feature will reuse.

- [X] T001 Verify existing scripts and workspace boundaries in `package.json`, `client/package.json`, `server/package.json`, and `shared/package.json`; keep the implementation on the existing TypeScript stack without adding packages.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Expand durable answer storage and shared result types. Both user stories depend on preserving all valid attempts while keeping the current winner authoritative.

### Tests first

- [X] T002 [P] Add a Vitest SQLite migration regression in `tests/integration/results-review/schema-migration.test.ts` that preserves an existing winner and verifies rank 1, winner status, and the unique per-question winner constraint.
- [X] T003 [P] Add a Vitest submission persistence test in `tests/integration/buzzer-flow/answer-submission.test.ts` proving a valid post-winner submission by another group is recorded, while same-group duplicates and invalid submissions are rejected without a rank.

### Shared contracts and implementation

- [X] T004 [P] Define typed teacher activity summaries, question review rows, and review records in `shared/src/results-review/contracts.ts` to match `specs/004-results-review/contracts/results-review-api.md`.
- [X] T005 Rebuild `buzzer_submissions` with migration `server/src/features/user-stage-sync/persistence/migrations/004-results-review.sql`; preserve each existing winner as `submission_rank = 1` and `is_winner = 1`, add `UNIQUE(activity_id, question_number, group_id)` and `UNIQUE(activity_id, question_number, submission_rank)`, and add the one-winner-per-question partial unique index.
- [X] T006 Update `server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts` and `server/src/features/buzzer-flow/application/buzzer-flow-service.ts` to save one valid first submission per group/question in an immediate transaction, assign each question's next rank, preserve the first winner, and enforce `answer_parts_json` as an ordered array of non-empty trimmed strings whose count equals that question's blank count.
- [X] T007 Update `server/src/features/buzzer-flow/application/winning-answer-provider.ts` and `server/src/features/user-stage-sync/application/answer-status-access.ts` to select only `is_winner = 1` for winner summaries and the Guided Notes provider, without exposing answer details in student live status or logs.
- [X] T008 Run the focused migration and submission checks from `specs/004-results-review/quickstart.md`; complete this foundation checkpoint before starting either user story.

**Checkpoint**: Existing winners survive migration; later valid group answers persist with stable per-question ranks; winner projections remain winner-only.

---

## Phase 3: User Story 1 - 學生檢視最終結果 (Priority: P1) 🎯 MVP

**Goal**: Students can read complete winner/no-answer results after an activity ends, with no group or answer leakage before end, and lose access to the former activity after switching.

**Independent Test**: With real SQLite records and an Express app, verify live access returns no group/answer details; after end, the joined student receives exactly one winner or unanswered row per imported question; after joining another activity, the student cannot read the old activity.

### Tests for User Story 1

- [X] T009 [P] [US1] Add Vitest integration cases in `tests/integration/results-review/student-results.test.ts` for ended winner results, an unanswered question, live-phase privacy, unauthorized membership, and denial after the student session switches activities.

### Implementation for User Story 1

- [X] T010 [US1] Update `server/src/features/user-stage-sync/application/answer-status-access.ts` to return complete imported-question winner/no-winner results only after end and to omit group, answer, rank, and winner details while live.
- [X] T011 [US1] Update `client/src/features/user-stage-sync/views/StudentJoinView.tsx` and the existing student result-list component to show final results only after `已結束`, preserving imported question order and a clear unanswered state.
- [X] T012 [US1] Run the student result integration tests from `specs/004-results-review/quickstart.md` and resolve failures before moving to the teacher story.

**Checkpoint**: Student result access passes its independent normal and boundary cases without exposing full results during the live phase.

---

## Phase 4: User Story 2 - 老師檢視完整作答紀錄並帶領檢討 (Priority: P1)

**Goal**: The owning teacher can select prior activities and inspect every valid first group submission after end, including answer parts, question-specific rank, and winner status.

**Independent Test**: With real SQLite records, verify the owner sees ranked winner and non-winner attempts plus unanswered questions; non-owners, students, and callers before end receive clear denials with no records.

### Tests for User Story 2

- [X] T013 [P] [US2] Add Vitest integration tests in `tests/integration/results-review/teacher-review.test.ts` for complete ordered history, per-question ranks remaining identical across repeated reads, winner immutability, unanswered questions, non-owner/student denial, and pre-end denial.
- [X] T014 [P] [US2] Add a Vitest acceptance test in `tests/acceptance/results-review/teacher-history.test.tsx` proving the teacher can create/select an old activity and open its persisted review after creating a new activity, and that the new activity has no inherited submissions.

### Implementation for User Story 2

- [X] T015 [US2] Implement owner-filtered activity listing and review query in `server/src/features/results-review/persistence/results-review-repository.ts` and `server/src/features/results-review/application/results-review-service.ts`; include every imported question and order records by `submission_rank`.
- [X] T016 [US2] Add `GET /api/teacher/activities` and owner-only, ended-phase `GET /api/activities/:activityId/review-records` routes in `server/src/features/results-review/api/results-review-routes.ts`, register them in `server/src/app.ts`, and return clear role, ownership, phase, and persisted-data errors without answer details in error text or logs.
- [X] T017 [US2] Add typed calls for the activity list and review-record response in `client/src/features/results-review/services/results-review-api.ts` using contracts from `shared/src/results-review/contracts.ts`.
- [X] T018 [US2] Add the teacher's persisted activity-history selector in `client/src/features/results-review/components/TeacherActivityHistory.tsx` and connect it to `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`, enabling review only for ended activities.
- [X] T019 [US2] Build the read-only full submission table in `client/src/features/results-review/components/TeacherSubmissionReview.tsx`, displaying question number, group, ordered answer parts, per-question rank, winner marker, and explicit unanswered state without grading or notes.
- [X] T020 [US2] Run the teacher integration and acceptance tests from `specs/004-results-review/quickstart.md`; resolve failures before final cross-cutting validation.

**Checkpoint**: The activity owner can open and reload complete old or current ended-activity records; unauthorized and live-phase requests reveal no records.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Validate the integrated feature, security boundaries, documentation, and architecture alignment.

- [X] T021 [P] Review result routes, student events, and logging in `server/src/features/results-review/`, `server/src/features/user-stage-sync/`, and `server/src/features/buzzer-flow/` to confirm no non-winner answer or full review payload is emitted before end or written to logs.
- [X] T022 Run all focused and full Vitest suites plus workspace builds listed in `specs/004-results-review/quickstart.md`, then record the exact commands and actual outcomes in that file.
- [X] T023 Compare the implemented routes, persistence, role boundaries, and views with `diagrams/004-results-review-component.puml`, `diagrams/004-results-review-class.puml`, and `diagrams/004-results-review-sequence.puml`; update the diagrams and regenerate their PNGs in `diagrams/` if implementation changes the blueprint.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No feature implementation dependency; verify existing workspace scripts and package boundaries.
- **Foundational (Phase 2)**: Depends on Setup. Migration, shared result types, and winner-preserving submission storage block both user stories.
- **User Stories (Phase 3+)**: Both depend on the completed foundation checkpoint. US1 is listed first as MVP; US2 can proceed after the foundation and is independently testable.
- **Polish (Phase 5)**: Depends on both desired user stories passing their checkpoints.

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only. Tests student privacy, final winner/no-answer output, and activity-switch access.
- **US2 (P1)**: Depends on Phase 2 only. Tests teacher history listing and full post-end review access; it does not depend on US1 UI work.

### Dependency Graph

```text
T001
 └─> T002, T003, T004
      └─> T005
           └─> T006
                └─> T007
                     └─> T008 (foundation checkpoint)
                          ├─> T009 -> T010 -> T011 -> T012 (US1)
                           └─> T013, T014 -> T015 -> T016 -> T017 -> (T018 || T019) -> T020 (US2)
                                Both stories -> (T021 || T023) -> T022 (final validation)
```

### Parallel Opportunities

- T002 and T003 touch separate test files and can be prepared in parallel after T001.
- T004 can be prepared alongside the independent foundation tests; T005/T006/T007 remain ordered because the schema and transaction determine winner projections.
- After T008, US1 and US2 are independently implementable in parallel if integration work is coordinated. Within US2, T013 and T014 are separate test files and T018/T019 are separate UI components after the API contract exists.
- T021 and T023 inspect different concerns and can be completed in parallel after both stories; T022 runs last, after those reviews, as the final test/build and evidence-recording gate.

## Parallel Example: User Story 2

```text
After T008, prepare the teacher route coverage and teacher UI acceptance flow independently:
Task: T013 tests/integration/results-review/teacher-review.test.ts
Task: T014 tests/acceptance/results-review/teacher-history.test.tsx

After T017, implement the two separate teacher UI components:
Task: T018 client/src/features/results-review/components/TeacherActivityHistory.tsx
Task: T019 client/src/features/results-review/components/TeacherSubmissionReview.tsx
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 1 and Phase 2; require T008 to pass before continuing.
2. Complete US1 test and implementation tasks T009–T012.
3. **STOP and VALIDATE**: run the student integration tests and confirm the live privacy boundary and ended results independently.
4. US1 is the first demonstrable increment; continue to US2 for the complete teacher review scope.

### Incremental Delivery

1. Establish shared persisted attempts and contracts.
2. Deliver student final results (US1) and validate independently.
3. Deliver owner activity history and complete review records (US2) and validate independently.
4. Complete logging, full test/build, and diagram alignment checks.

## Notes

- Every implementation task identifies the source, test, diagram, or documentation file it changes or validates.
- Test tasks are required by the constitution and cover normal and boundary behavior for each story.
- Shared transaction/persistence prerequisites appear in Phase 2 because both stories consume the same expanded result store.
- No test result is asserted here; quickstart must record actual results after implementation.

## Phase 6: Convergence

- [X] T024 Validate winner-state consistency in `server/src/features/buzzer-flow/application/winning-answer-provider.ts` so a question with saved submissions but no valid winner returns `ANSWER_RESULT_INVALID` instead of an unanswered result; add a regression test in `tests/unit/buzzer-flow/winning-answer-provider.test.ts` per FR-002, FR-004, and plan: persisted-record validation (partial).

## Phase 7: Convergence

- [X] T025 Validate in `server/src/features/buzzer-flow/application/winning-answer-provider.ts` that the selected winning submission has `submission_rank = 1`, and return `ANSWER_RESULT_INVALID` when a later rank is marked as winner; add a regression test in `tests/unit/buzzer-flow/winning-answer-provider.test.ts` per FR-004, FR-005, and plan: first committed submission remains winner (partial).

## Phase 8: Convergence

- [X] T026 Add a post-end student activity-switch action in `client/src/features/user-stage-sync/views/StudentJoinView.tsx` and test that the same student session can join a new activity and then loses access to the old result in `tests/integration/results-review/student-results.test.ts` per FR-009 and US1/AC4 (partial).
