---
description: "Implementation tasks for the classroom buzzer flow"
---

# Tasks: 課堂搶答流程

**Input**: Design documents from `/specs/003-buzzer-flow/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included because the project constitution requires normal and boundary coverage for every core feature. Write each story's tests before its implementation, confirm they fail for the expected missing behavior, and require the story's focused suite to pass before proceeding to the next phase.

**Organization**: Tasks are grouped by the three P1 user stories in `spec.md`. Story 2 depends on the phase lifecycle from Story 1; Story 3 builds on the persisted submissions from Story 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no unfinished dependency.
- **[Story]**: Maps a task to a user story from `spec.md`.
- Every task description names the file(s) to create or modify.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing workspace foundation and avoid unnecessary dependencies or secret configuration changes.

- [X] T001 Verify existing React/Vite/Tailwind, Express, SQLite, WebSocket, TypeScript, and Vitest dependencies plus license records in `package.json`, `client/package.json`, `server/package.json`, `shared/package.json`, and `THIRD_PARTY_NOTICES.md`; do not add packages or credentials for this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define transport types and durable schema shared by the story implementations.

**⚠️ CRITICAL**: Finish this phase and pass the schema checks before starting any user story.

- [X] T002 [P] Define question, submission, teacher/student status, and realtime event types in `shared/src/buzzer-flow/contracts.ts`, export them from `shared/src/buzzer-flow/index.ts`, and re-export them from `shared/src/index.ts` without duplicating `WinningAnswerResult` from `shared/src/guided-notes/contracts.ts`.
- [X] T003 [P] Add `server/src/features/user-stage-sync/persistence/migrations/003-buzzer-flow.sql` for `buzzer_submissions` with the data-model constraints: `accepted_order` is “Database-generated monotonic order for accepted submissions. It is not supplied by a client.”; `activity_id` is an “Existing activity foreign key.”; `question_number` “Must reference a question imported for this activity.”; `group_id` “Must reference a group belonging to this activity.”; `answer_parts_json` is a “JSON array of ordered non-empty strings; item count equals detected blank count.”; `accepted_at` is a “Server-side acceptance timestamp; client timestamps are ignored.” Add the composite group key needed for the foreign key and enforce `UNIQUE(activity_id, question_number)`.
- [X] T004 Add schema integration coverage in `tests/integration/buzzer-flow/schema.test.ts` for migration application, foreign-key rejection, the unique winner constraint, accepted-order generation, and valid/invalid JSON answer-part storage; use the SQLite helper in `tests/helpers/sqlite.ts`.

**Checkpoint**: `npm.cmd test -- tests/integration/buzzer-flow/schema.test.ts` passes before Story 1 begins.

---

## Phase 3: User Story 1 - 老師開啟與結束搶答 (Priority: P1) 🎯 MVP Checkpoint

**Goal**: Let the activity owner start only a ready activity with imported questions, then end it with a consistent phase transition; prevent Guided Notes question replacement after start.

**Independent Test**: With an imported question set, the teacher can transition preparation → live → ended; a missing question set, student/other teacher, duplicate/out-of-order transition, or post-start reimport is rejected without changing saved phase/questions.

### Tests for User Story 1

- [X] T005 [P] [US1] Add phase lifecycle integration cases to `tests/integration/buzzer-flow/activity-phase.test.ts` for owner authorization, preparation → live → ended, start without questions, duplicate transitions, and phase/revision remaining unchanged after rejection.
- [X] T006 [P] [US1] Add Guided Notes import freeze cases to `tests/integration/buzzer-flow/question-freeze.test.ts` proving the question numbers and blank mappings can be imported/replaced during preparation but cannot change once the activity is live or ended.

### Implementation for User Story 1

- [X] T007 [US1] Refactor `server/src/features/user-stage-sync/persistence/activity-repository.ts` and `server/src/features/user-stage-sync/application/activity-service.ts` so phase validation and update execute in one synchronous immediate SQLite transaction; keep teacher ownership, ordered transitions, and revision increment atomic.
- [X] T008 [US1] Add the start prerequisite in `server/src/features/user-stage-sync/application/activity-service.ts` and `server/src/features/user-stage-sync/persistence/activity-repository.ts`: inside the same immediate transition transaction, require a non-empty imported question list and a positive, consistent blank mapping for every question, and return a clear `QUESTIONS_REQUIRED` or invalid-mapping error without changing phase.
- [X] T009 [P] [US1] Enforce the preparation-only Guided Notes question/source replacement rule in `server/src/features/guided-notes/application/import-guided-notes.ts` and `server/src/features/guided-notes/persistence/guided-notes-repository.ts`, checking phase in the same save transaction and preserving current question/mapping rows on rejection.
- [X] T010 [P] [US1] Add teacher start/end controls, current phase feedback, and actionable API errors to `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`; update `client/src/main.tsx` only as needed to connect the controls to the existing activity API.
- [X] T011 [US1] Add teacher start/end acceptance coverage in `tests/acceptance/buzzer-flow/teacher-phase-flow.test.tsx`: verify each manual open/end operation completes within 2,000 ms, subscribed teacher and student views show the changed phase within 1,000 ms, elapsed time alone never ends an activity, missing Guided Notes blocks start, and rejected transitions keep the displayed phase unchanged.

**Checkpoint**: Run `npm.cmd test -- tests/integration/buzzer-flow/activity-phase.test.ts tests/integration/buzzer-flow/question-freeze.test.ts tests/acceptance/buzzer-flow/teacher-phase-flow.test.tsx`; all Story 1 cases must pass before Story 2 begins.

---

## Phase 4: User Story 2 - 學生組別提交答案 (Priority: P1)

**Goal**: Allow an activity's joined student group to submit ordered non-empty answer parts for an imported question while live; accept one winner per question and reject duplicates, malformed submissions, and post-close submissions.

**Independent Test**: In a live activity, submit a valid single- or multi-blank answer; confirm exactly one concurrent valid submission wins, parts retain their order, same-group duplicate/blank/wrong-count/pre-start/post-end/unknown-question attempts are rejected, and no result is overwritten.

### Tests for User Story 2

- [X] T012 [P] [US2] Add submission service unit cases in `tests/unit/buzzer-flow/buzzer-flow-service.test.ts` for role/membership/phase/question checks, exact answer-part count, trimmed non-empty strings, duplicate detection, and generic question-closed errors that do not reveal winner identity.
- [X] T013 [P] [US2] Add submission API and race integration cases in `tests/integration/buzzer-flow/answer-submission.test.ts` for 100 competing valid group submissions yielding exactly one winner, duplicate/blank/wrong-count validation, a valid answer accepted after elapsed simulated time while the teacher has not ended the activity, and answers racing activity end with no commit accepted after the end transition commits.

### Implementation for User Story 2

- [X] T014 [US2] Implement `server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts` to insert and query accepted winners; validate `activity_id`, imported `question_number`, matching activity/group membership, and `answer_parts_json` count/content inside one synchronous immediate transaction, and map unique constraint conflicts to duplicate or question-closed outcomes without storing rejected payloads.
- [X] T015 [US2] Implement request validation and orchestration in `server/src/features/buzzer-flow/application/buzzer-flow-service.ts`: accept only an exact request shape with positive imported question number and ordered string parts; each part must be non-empty after trimming; validate student session, activity/group membership, and live phase in the same acceptance transaction; ignore client timestamps.
- [X] T016 [US2] Add `GET /api/activities/:activityId/questions` and `POST /api/activities/:activityId/answers` in `server/src/features/buzzer-flow/api/buzzer-flow-routes.ts`, mount them in `server/src/app.ts`, and return stable Traditional Chinese errors without echoing answer text or competitor data.
- [X] T017 [P] [US2] Add the student answer API client in `client/src/features/buzzer-flow/services/buzzer-flow-api.ts` and implement one input per imported blank with ordered submission and clear validation/phase feedback in `client/src/features/buzzer-flow/components/AnswerQuestionForm.tsx` and `client/src/features/buzzer-flow/views/StudentAnswerView.tsx`, following the shared HTTP contract independently of server route implementation.
- [X] T018 [US2] Integrate `StudentAnswerView` into the existing student route in `client/src/features/user-stage-sync/views/StudentJoinView.tsx` (already mounted by `client/src/main.tsx`) and verify the student can load question numbers, submit only while live, and see only their own acceptance acknowledgement in `tests/acceptance/buzzer-flow/student-answer-flow.test.tsx`.

**Checkpoint**: Run `npm.cmd test -- tests/unit/buzzer-flow/buzzer-flow-service.test.ts tests/integration/buzzer-flow/answer-submission.test.ts tests/acceptance/buzzer-flow/student-answer-flow.test.tsx`; all Story 2 cases, including concurrency and end-race boundaries, must pass before Story 3 begins.

---

## Phase 5: User Story 3 - 老師即時監看及共用結果 (Priority: P1)

**Goal**: Give teachers live per-question winner/status updates, keep other groups' live information private from students, restore authorized state after reload/reconnect, and expose complete end results to students and Guided Notes.

**Independent Test**: Connect a teacher and multiple student groups, accept an answer, verify only the teacher receives live winner details and each student sees only its own accepted status; after ending, verify teacher/student and the provider receive a complete question-number-matched result including no-winner entries.

### Tests for User Story 3

- [X] T019 [P] [US3] Add role/phase projection tests in `tests/unit/buzzer-flow/answer-status-access.test.ts` for teacher live details, student live own-only status, preparation empty status, ended full results, membership denial, and no-winner entries.
- [X] T020 [P] [US3] Add provider and data-integrity tests in `tests/unit/buzzer-flow/winning-answer-provider.test.ts` for pre-end rejection, exact imported question coverage/order, `winner:false`, winner group/ordered parts, part-count mismatch, and malformed/missing persisted data.
- [X] T021 [P] [US3] Add realtime privacy and reconnect integration cases in `tests/integration/buzzer-flow/realtime-visibility.test.ts` proving winner events reach only the owner teacher within 1 second, phase events contain no answers, student reads/events contain no other-group details while live, and resubscribe/reload restores authorized persisted state.
- [X] T022 [P] [US3] Add final-results acceptance coverage in `tests/acceptance/buzzer-flow/final-results.test.tsx` proving the teacher and joined student can see every result after end while live students cannot see competing groups' submissions.

### Implementation for User Story 3

- [X] T023 [P] [US3] Implement role-aware status projections in `server/src/features/user-stage-sync/application/answer-status-access.ts` and `server/src/features/user-stage-sync/api/answer-status-routes.ts`: teacher live response has one `open`/`won` item per question; joined student live response contains only its own accepted question numbers; ended response contains one complete result per imported question.
- [X] T024 [P] [US3] Implement the persisted `WinningAnswerProvider` in `server/src/features/buzzer-flow/application/winning-answer-provider.ts`, requiring phase `已結束`, returning every `activity_questions` number once in sorted order with `winner:false` for no submission and winner identity plus ordered answer parts otherwise.
- [X] T025 [P] [US3] Extend `server/src/features/user-stage-sync/realtime/websocket-server.ts` with role-scoped `buzzer.question.updated` publication after database commit; preserve answer-free `activity.phase.updated` broadcasts and exclude all student sockets from live winner events.
- [X] T026 [US3] Extend `client/src/features/user-stage-sync/services/activity-socket.ts` to parse typed updates and refresh authorized snapshots after phase changes/reconnects, plus `client/src/features/user-stage-sync/services/answer-access-api.ts` for typed status responses and page-load recovery.
- [X] T027 [US3] Add teacher live results and post-end results rendering in `client/src/features/buzzer-flow/components/QuestionResultList.tsx`, and integrate it with `client/src/features/user-stage-sync/views/TeacherActivityView.tsx` and `client/src/features/user-stage-sync/views/StudentJoinView.tsx` so student UI never renders another group's status before end.
- [X] T028 [US3] Wire the provider and role-scoped publisher into server composition in `server/src/app.ts` and verify the existing Guided Notes export consumes the same provider in `server/src/features/guided-notes/api/guided-notes-routes.ts`.

**Checkpoint**: Run `npm.cmd test -- tests/unit/buzzer-flow tests/integration/buzzer-flow tests/acceptance/buzzer-flow`; all Story 3 visibility, reconnect, result completeness, and provider tests must pass before final validation.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the integrated result, preserve security/privacy, and keep the documented blueprint accurate.

- [X] T029 Review `server/src/features/buzzer-flow/`, `server/src/features/user-stage-sync/realtime/websocket-server.ts`, and `server/src/logging/logger.ts` to confirm no answer parts, request bodies, service-account credentials, or provider payloads enter logs; confirm `.env.example` and `.gitignore` remain unchanged for this feature.
- [X] T030 Run the final feature and repository checks from `specs/003-buzzer-flow/quickstart.md` (`npm.cmd test -- tests/unit/buzzer-flow tests/integration/buzzer-flow tests/acceptance/buzzer-flow`, `npm.cmd test`, and `npm.cmd run build`) and record actual command results in `specs/003-buzzer-flow/quickstart.md`.
- [X] T031 Compare implemented components, class responsibilities, and message flow with `diagrams/003-buzzer-flow-component.puml`, `diagrams/003-buzzer-flow-class.puml`, and `diagrams/003-buzzer-flow-sequence.puml`; update any diverged `.puml` files under `diagrams/` and regenerate their colocated PNGs with `java -jar plantuml.jar "./diagrams/*.puml"`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 checks the already-installed stack and license records.
- **Foundational (Phase 2)**: T002 and T003 may proceed in parallel after T001; T004 depends on T003. All must pass before Story 1.
- **User Story 1 (Phase 3)**: Depends on the foundation. T005/T006 are independent tests and precede their implementation. T007 is required before T008; T009 and T010 have distinct files and can proceed alongside the server changes; T011 validates the UI integration.
- **User Story 2 (Phase 4)**: Depends on Story 1's stage lifecycle and question freeze. T012/T013 precede implementation; T014 precedes T015, T016, and student UI integration. T017 depends on T002 and T016.
- **User Story 3 (Phase 5)**: Depends on Story 2's durable accepted-submission behavior. T019–T022 can be prepared in parallel before implementation; T023/T024/T025 have distinct files and can proceed in parallel after US2. T026 depends on realtime/API contracts; T027 depends on T023/T025/T026; T028 composes the provider, publisher, and status route after T023–T025.
- **Polish (Phase 6)**: Depends on all three story checkpoints.

### User Story Dependencies

- **US1 (P1)**: Starts after foundational contracts/schema; no dependency on another user story. Delivers the first phase-control checkpoint.
- **US2 (P1)**: Depends on US1's live/ended lifecycle and immutable imported questions; consumes the shared submission contract and SQLite schema.
- **US3 (P1)**: Depends on US2's saved submissions; adds live teacher visibility, privacy filtering, reconnect recovery, final results, and the Guided Notes provider projection.

### Dependency Graph

```text
Setup → Foundational → US1 → US2 → US3 → Polish
```

US3 also requires US2's saved submissions, so its actual dependency chain is **US1 → US2 → US3 → Polish**.

### Parallel Opportunities

- T002 and T003 can run in parallel; T004 follows the migration.
- Within US1, T005 and T006 can run in parallel; server phase changes and the separate teacher view can be developed by different implementers after the contracts are fixed.
- Within US2, T012 and T013 can run in parallel. After repository/service contracts stabilize, the React form can be developed separately from route wiring.
- Within US3, T019–T022 are separate test files. T023 (status API), T024 (provider), and T025 (WebSocket publisher) touch different files and can be implemented in parallel after US2. UI work follows their contracts.

## Parallel Example: User Story 2

```text
Task: T012 unit tests in tests/unit/buzzer-flow/buzzer-flow-service.test.ts
Task: T013 API/concurrency tests in tests/integration/buzzer-flow/answer-submission.test.ts

After shared contracts and schema are stable:
Task: T014 repository in server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts
Task: T017 student form in client/src/features/buzzer-flow/components/AnswerQuestionForm.tsx
```

## Parallel Example: User Story 1

```text
Task: T005 phase lifecycle tests in tests/integration/buzzer-flow/activity-phase.test.ts
Task: T006 question-freeze tests in tests/integration/buzzer-flow/question-freeze.test.ts

After those tests are in place, T009 (Guided Notes import freeze) and T010 (teacher view) can run in parallel with the transaction work; T008 follows T007, then run T011 after integration.
```

## Parallel Example: User Story 3

```text
Task: T019 status projection tests in tests/unit/buzzer-flow/answer-status-access.test.ts
Task: T020 provider tests in tests/unit/buzzer-flow/winning-answer-provider.test.ts
Task: T021 realtime privacy tests in tests/integration/buzzer-flow/realtime-visibility.test.ts
Task: T022 final-result acceptance tests in tests/acceptance/buzzer-flow/final-results.test.tsx

After US2 passes, T023 status API, T024 provider, and T025 realtime publisher each use separate server files and can proceed in parallel; T028 wires them into app composition afterward.
```

## Implementation Strategy

### MVP Checkpoint

1. Complete Setup and Foundational phases.
2. Complete US1 and pass its lifecycle/import-freeze tests.
3. US1 alone is the smallest verified checkpoint, but the usable classroom buzzer MVP is **US1 + US2**: teachers can open/end and groups can compete with a durable single winner.
4. Stop at each phase checkpoint; do not continue if that phase's tests fail.

### Incremental Delivery

1. Setup + Foundational: typed contracts and validated durable schema.
2. US1: teacher phase controls and stable question set.
3. US2: validated answer submission and deterministic first committed winner.
4. US3: realtime teacher monitoring, live student privacy, reconnect snapshots, final results, and Guided Notes provider.
5. Polish: run feature/full tests and build; verify implementation against all PlantUML blueprints.

## Notes

- Every task uses the required `- [ ] T### [P?] [US#?] Description with exact path` checklist format.
- `[P]` is used only where files and prerequisites are independent.
- Unit/integration/acceptance tests include normal and boundary cases required by the constitution.
- No Google Sheets client or new secret is introduced; Guided Notes remains the Sheets integration owner.
- Answer payloads must not enter logs, student live events, or rejection messages.

## Phase 7: Convergence

- [X] T032 Validate that a student's referenced group belongs to the subscribed activity before registering a WebSocket subscription, and add an integration case that rejects mismatched activity/group membership while preserving valid subscriptions per FR-015 (partial).
