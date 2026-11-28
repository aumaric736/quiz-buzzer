---

description: "Implementation tasks for feature 008"

---

# Tasks: 活動即時狀態與學習單流程修正

**Input**: Design documents from specs/008-runtime-behavior-alignment/

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/team-activity-lifecycle.md, quickstart.md

**Tests**: Included because the project constitution requires normal and boundary coverage for core features.

**Organization**: Tasks are grouped by the four P1 user stories. Each task names the files to change and is ordered by dependencies.

## Format: `[ID] [P?] [Story] Description`

- [P] means the task changes files separate from other incomplete tasks and can proceed concurrently.
- [Story] maps implementation work to the user stories in spec.md.
- Each task includes the exact file path or paths to create or modify.

## Phase 1: Setup

**Purpose**: Existing TypeScript workspaces, dependencies, migration discovery, and Vitest configuration already support this feature. No setup changes are needed.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the durable join gate, offline timestamp, and persisted question display order in database migration 009. The migration runner discovers and applies numbered SQL files automatically; do not add manual registration in database.ts. Do not modify migration 005 or specs/005-role-return/.

- [X] T001 Add joining_opened_at and disconnected_at plus activity_questions.display_order in server/src/features/user-stage-sync/persistence/migrations/009-runtime-behavior-alignment.sql. Backfill display_order as contiguous zero-based order by ascending question_number for existing questions. Backfill joining_opened_at only for 準備中 activities with an assigned active student membership and a ready set: at least one question, and every question has at least one mapping whose slot indexes start at 0 and are contiguous (min(slot_order) = 0 and max(slot_order) = mapping_count - 1); otherwise leave it null and preserve memberships so the teacher can complete the set. Backfill disconnected_at from updated_at for non-retired legacy student sessions with non-null disconnected_until, retaining their activity/group/role association. Preserve question_number as the answer/mapping identity and leave migration 005 untouched.
- [X] T002 Add schema migration coverage in tests/integration/user-stage-sync/runtime-behavior-schema.test.ts for automatic numeric migration discovery, the three new columns, legacy question ordering, ready versus unready preparing activities with existing memberships, mappings starting at 1 or containing gaps remaining unready, valid zero-based contiguous mappings becoming ready, preparing activities without memberships, disconnected-session backfill, preserved membership, and ordered migration execution.

**Checkpoint**: Migration 009 is automatically discovered, preserves existing records, and gives all activity questions a deterministic display order before story work begins.

---

## Phase 3: User Story 1 - 依活動進度加入小組 (Priority: P1) MVP

**Goal**: Let the teacher open joining only after a ready question set, and apply phase-aware presence, vacancy release, reconnect, and end-state rules.

**Independent Test**: In a preparing activity, reject joining and opening before readiness; open joining atomically when ready; verify an online vacancy is immediately reusable after offline classification, recovery/fallback preserves the correct role, reconnect during answering has no deadline, and ended activities reject participation.

### Tests for User Story 1

- [X] T003 [P] [US1] Extend tests/unit/user-stage-sync/group-service.test.ts for pre-open rejection, ready-set/capacity checks, online vacancy reuse, original-role recovery, and fallback to another available group when the original group is full.
- [X] T004 [P] [US1] Add tests/integration/user-stage-sync/team-joining-open.test.ts for owner-only opening, question readiness, durable one-way marker, phase remaining 準備中, and import/open race rejection.
- [X] T005 [P] [US1] Add tests/integration/user-stage-sync/phase-aware-presence.test.ts for clean-close immediacy, 30 consecutive missed-heartbeat seconds, leader online-count reduction, team-phase vacancy release, answering membership retention, and unlimited reconnect.
- [X] T006 [P] [US1] Add tests/acceptance/user-stage-sync/team-joining-open.test.tsx for the teacher action, pre-open student rejection, post-open joining, answering reconnect, and ended join/reconnect denial.

### Implementation for User Story 1

- [X] T007 [US1] Update server/src/features/user-stage-sync/persistence/activity-repository.ts and server/src/features/user-stage-sync/application/activity-service.ts to verify at least one question and one or more zero-based contiguous mappings per question, then atomically set joining_opened_at, freeze question edits, advance the existing revision, and leave the phase unchanged.
- [X] T008 [US1] Update server/src/features/user-stage-sync/api/activity-routes.ts to expose the authenticated activity-owner open-joining action and return actionable errors for ownership, phase, or readiness failures.
- [X] T009 [US1] Update server/src/features/user-stage-sync/application/group-service.ts so new enrollment requires joining_opened_at, 準備中, and fewer than two online members; let a team-phase returning student choose another available group if their original group is full, without creating duplicate membership.
- [X] T010 [US1] Update server/src/features/user-stage-sync/application/student-session-presence-service.ts to mark clean closes offline immediately, classify an unclean drop after 30 consecutive seconds without heartbeat, and stop using heartbeat timeout as a reconnect-retirement deadline.
- [X] T011 [US1] Update server/src/features/user-stage-sync/persistence/group-repository.ts and server/src/features/user-stage-sync/application/session-service.ts to count only online members for team-phase capacity, retain offline membership, preserve original role when space remains, and support reassignment after the original team vacancy has been filled.
- [X] T012 [US1] Update server/src/features/user-stage-sync/realtime/websocket-server.ts and shared/src/user-stage-sync/contracts.ts to publish committed join-open and presence state with existing role-scoped revisions.
- [X] T013 [US1] Update client/src/features/user-stage-sync/services/activity-api.ts and client/src/features/user-stage-sync/views/TeacherActivityView.tsx with the explicit 準備中 open-joining action; keep the existing student team-formation screen unchanged.

**Checkpoint**: Opening, enrollment, presence, recovery, and end-state rules work without adding an activity phase or changing the student team screen.

---

## Phase 4: User Story 2 - 穩定查看即時小組人數與答案 (Priority: P1)

**Goal**: Give teachers a stable live view of per-question answered/total groups, group answers, and current ranks while keeping student data scoped to their own team.

**Independent Test**: Submit valid, invalid, duplicate, and later-first answers from multiple groups. Verify counts include offline groups, the selected question lists answered/unanswered teams with answer and rank, ranking follows feature 004, students see only their own team, and authorized views update within two seconds after commit.

### Tests for User Story 2

- [X] T014 [P] [US2] Add tests/integration/buzzer-flow/teacher-question-progress.test.ts for answered/total counts including offline groups, unanswered groups, stored answer content, display order, feature-004 rank order, and invalid/duplicate exclusion.
- [X] T015 [P] [US2] Add tests/acceptance/buzzer-flow/teacher-question-progress.test.tsx for selecting a question and rendering live counts, answered/unanswered groups, answers, ranks, and the saved worksheet order.
- [X] T016 [P] [US2] Extend tests/acceptance/buzzer-flow/student-answer-privacy.test.ts to assert snapshots and events never expose another group’s answer state, content, or rank.

### Implementation for User Story 2

- [X] T017 [US2] Extend shared/src/buzzer-flow/contracts.ts with teacher progress response/event shapes that carry source question number, display order, answered/total group counts, answered/unanswered teams, stored answer content, and rank.
- [X] T018 [US2] Extend server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts with an authorized activity-scoped progress query covering every group, including offline groups, and returning each question in display_order with its saved answer/rank state.
- [X] T019 [US2] Update server/src/features/buzzer-flow/api/buzzer-flow-routes.ts to serve teacher-owner-only progress and selected-question group details without adding activity-wide student endpoints.
- [X] T020 [US2] Update server/src/features/buzzer-flow/application/buzzer-flow-service.ts and server/src/features/buzzer-flow/api/buzzer-flow-routes.ts to publish committed valid-first-answer progress, retain subsequent ranks after a winner, and avoid progress changes for invalid/duplicate submissions.
- [X] T021 [US2] Extend server/src/features/user-stage-sync/realtime/websocket-server.ts, client/src/features/user-stage-sync/services/activity-socket.ts, and client/src/features/user-stage-sync/services/live-activity-state.ts to deliver revision-ordered teacher progress after commit and preserve own-team-only student projections.
- [X] T022 [US2] Add client/src/features/buzzer-flow/components/QuestionAnswerProgress.tsx to render the selected question’s answered/unanswered group details, saved answers, and current ranks in display order.
- [X] T023 [US2] Update client/src/features/user-stage-sync/views/TeacherActivityView.tsx to select a question, display every question’s answered/total count, integrate QuestionAnswerProgress, and preserve feature 004 ended-result access.

**Checkpoint**: Teacher progress agrees with committed answer records and ranking; student answer data remains own-team-only.

---

## Phase 5: User Story 3 - 清楚呈現小組加入狀態 (Priority: P1)

**Goal**: Show authoritative join status and online member count only, with stable alignment and no numeric seat/capacity fields.

**Independent Test**: Verify roster states before readiness/opening, with vacancies, at two online members, after a member goes offline, during answering with an offline member, and after end. Confirm join behavior matches the displayed state and online counts remain aligned across different team names.

### Tests for User Story 3

- [X] T024 [P] [US3] Extend tests/acceptance/user-stage-sync/group-presence-display.test.tsx for unavailable-before-open, open with a vacancy, 額滿 at two online members, full-to-open transition after offline classification, stopped during answering, ended state, and aligned online counts.
- [X] T025 [P] [US3] Extend tests/acceptance/user-stage-sync/group-roster-privacy.test.ts to verify teacher roster payloads and UI expose online count but omit seat, occupied-member, and capacity fields.

### Implementation for User Story 3

- [X] T026 [US3] Update server/src/features/user-stage-sync/application/group-roster-service.ts so 不可用 applies before opening, before readiness, or after end; 開放加入 requires the open marker, 準備中, readiness, and an online vacancy; 額滿 applies at two online members; 停止加入 applies throughout answering.
- [X] T027 [US3] Update shared/src/user-stage-sync/contracts.ts and client/src/features/user-stage-sync/services/live-activity-state.ts to carry and apply 不可用/開放加入/額滿/停止加入 plus online count without teacher-facing capacity or occupied-member data.
- [X] T028 [US3] Update client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx to render online counts in a fixed grid column and display authoritative join state, including 額滿, without deriving joinability from the count alone.

**Checkpoint**: Teacher roster reports the authoritative join state and aligned online count, with no numeric capacity data.

---

## Phase 6: User Story 4 - 匯入版面變化的學習單 (Priority: P1)

**Goal**: Recognize the original worksheet and supported layout variants, persist document order separately from question number, reject invalid imports atomically, and lock editing only after joining opens.

**Independent Test**: Import the original template and variants with reordered columns, changed question counts, instructions, blank rows, and source-number order such as 5, 1, 3. Verify list/progress/results preserve that document order; missing, duplicate, or ambiguous question rows reject the full import; a corrected import is allowed before opening and rejected afterward.

### Tests for User Story 4

- [X] T029 [P] [US4] Extend tests/unit/guided-notes/layout-recognizer.test.ts for moved/reordered headers, instruction/blank rows, source-row order, gapped and out-of-numeric-order question numbers, question-shaped rows with missing numbers, duplicate numbers, and actionable sheet/row diagnostics.
- [X] T030 [P] [US4] Extend tests/integration/guided-notes/import-api.test.ts for all-or-nothing failure, changed question counts, corrected retry before opening, display_order persistence, and import/replacement rejection after opening with prior data unchanged.
- [X] T031 [P] [US4] Extend tests/acceptance/guided-notes/sample-layouts.test.ts for direct original-template import and supported moved/reordered-column variants without special markers.
- [X] T032 [P] [US4] Extend tests/integration/results-review/teacher-review.test.ts to verify teacher final review lists questions in persisted display_order while ranks remain based on accepted-submission order.

### Implementation for User Story 4

- [X] T033 [US4] Update server/src/features/guided-notes/domain/layout-recognizer.ts to locate 題號, 題目, and 作答 by header and merged-cell structure regardless of supported column order, preserve worksheet row order, and report missing/duplicate numbers on question-structured rows with source-sheet/row diagnostics.
- [X] T034 [US4] Update server/src/features/guided-notes/persistence/guided-notes-repository.ts to atomically replace the complete question/mapping set, save unique contiguous zero-based display_order in source document order, allow question-count changes, preserve question_number as the answer/mapping key, and recheck phase plus joining_opened_at inside the write transaction.
- [X] T035 [US4] Update server/src/features/guided-notes/application/import-guided-notes.ts to permit imports/replacements only in 準備中 while joining_opened_at is null, invoke the transactional repository operation, and return actionable structural/numbering/locked errors through the existing feature-002 source and authorization flow.
- [X] T036 [US4] Update server/src/features/guided-notes/persistence/guided-notes-repository.ts, server/src/features/user-stage-sync/application/activity-service.ts, and server/src/features/buzzer-flow/api/buzzer-flow-routes.ts to list questions and mappings by display_order while retaining question_number for answer/mapping identity.
- [X] T037 [US4] Update server/src/features/user-stage-sync/application/answer-status-access.ts and server/src/features/user-stage-sync/realtime/websocket-server.ts to return question and answer snapshots in display_order, including own-team answer projections.
- [X] T038 [US4] Update shared/src/user-stage-sync/contracts.ts, shared/src/buzzer-flow/contracts.ts, and client/src/features/user-stage-sync/services/live-activity-state.ts to carry display order where required and preserve it when applying question/answer updates; do not sort imported questions numerically.
- [X] T039 [US4] Update server/src/features/buzzer-flow/application/winning-answer-provider.ts, server/src/features/results-review/persistence/results-review-repository.ts, client/src/features/results-review/components/TeacherSubmissionReview.tsx, and client/src/features/buzzer-flow/components/QuestionResultList.tsx to present final results in display_order while retaining the existing rank/winner rules.
- [X] T040 [US4] Update client/src/features/guided-notes/views/GuidedNotesImportView.tsx to enable import/replacement only before joining opens, disable or remove editing afterward, and show the server locked-state response without optimistic question changes.

**Checkpoint**: New imports retain source order through question lists, live progress, and final results; invalid imports write nothing; opening joining freezes the set.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify all four stories together and keep the user-facing guide and architecture artifacts aligned.

- [X] T041 [P] Update specs/008-runtime-behavior-alignment/quickstart.md if implementation changes any documented migration, order, import, joining, recovery, progress, privacy, or result behavior.
- [X] T042 Re-render diagrams/008-runtime-behavior-alignment-component.puml, diagrams/008-runtime-behavior-alignment-class.puml, and diagrams/008-runtime-behavior-alignment-sequence.puml to matching PNG files in diagrams/ and correct any design/implementation divergence.
- [X] T043 Run the scenarios in specs/008-runtime-behavior-alignment/quickstart.md, npm.cmd test, npm.cmd run build, and tests/integration/user-stage-sync/live-team-capacity.test.ts; record exact results and verify the 100-group/200-session two-second rendered-state target.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No initialization or dependency changes; existing workspaces and test infrastructure are reused.
- **Foundational (Phase 2)**: T001 and T002 complete before any story. Migration 009 is auto-discovered; do not modify migration 005 or specs/005-role-return/.
- **User Stories (Phases 3-6)**: All depend on Phase 2. Stories are ordered to avoid concurrent edits to shared lifecycle, realtime, and client state files.
- **Polish (Phase 7)**: Depends on all four stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; delivers the open gate, online capacity, phase-aware presence, and reconnect behavior. This is the MVP.
- **US2 (P1)**: Starts after US1; extends the authenticated live channel and teacher activity view using the committed activity/session foundation and feature-004 rank semantics.
- **US3 (P1)**: Starts after US2 because its roster state uses the same shared contracts and client live-state reducer.
- **US4 (P1)**: Starts after US3 to coordinate display-order fields across shared contracts, student/teacher question lists, live answer state, and result consumers; it also depends on the US1 opening marker to lock imports.

### Within Each User Story

- Write the listed story tests before implementation and confirm the new assertions fail for the current behavior before implementing the fix.
- Complete the story’s tests and implementation before its checkpoint.
- Persistence and shared contracts precede service/API/UI consumers.
- For worksheet questions, keep display_order as presentation order and question_number as the answer/mapping identity.
- Preserve feature 002 source authorization/import behavior and feature 004 rank/result authorization behavior.

### Parallel Opportunities

- **US1**: T003-T006 touch separate unit, integration, and acceptance files and can be prepared in parallel.
- **US2**: T014-T016 touch separate integration/acceptance test files and can be prepared in parallel.
- **US3**: T024-T025 touch separate acceptance test files and can be prepared in parallel.
- **US4**: T029-T032 touch parser, import integration, sample-layout, and result-review test files and can be prepared in parallel. Implementation tasks follow in dependency order because they share the import and display-order contract.

### Parallel Example: User Story 4

- Task T029: parser layout-recognition unit tests in tests/unit/guided-notes/layout-recognizer.test.ts
- Task T030: import transaction and lock integration tests in tests/integration/guided-notes/import-api.test.ts
- Task T031: direct-template and variant acceptance tests in tests/acceptance/guided-notes/sample-layouts.test.ts
- Task T032: final review ordering test in tests/integration/results-review/teacher-review.test.ts

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete migration 009 and its schema/backfill coverage.
2. Implement the teacher’s explicit open-joining action, ready-set validation, online vacancy behavior, and phase-aware reconnect.
3. Validate US1 independently before adding live answer progress, roster state labels, and worksheet structure variants.

### Incremental Delivery

1. Deliver US1 joining, presence, recovery, and ended-state behavior.
2. Add US2 live teacher answer progress and validate rank/privacy.
3. Add US3 authoritative roster status and fixed online-count alignment.
4. Add US4 import structure, persisted document order, import lock, and ordered result presentation.
5. Complete cross-story quickstart, test, build, capacity, and diagram validation.

## Notes

- Every [P] task uses files separate from other incomplete tasks and has no dependency on them.
- Every story task is labeled [US1] through [US4]; setup, foundation, and polish tasks have no story label.
- Team capacity is based on online members during formation; membership remains recoverable independently of connection state.
- Existing migrations are ordered by filename and discovered by the database initializer; there is no database.ts migration-registration task.
- Keep server/src/features/user-stage-sync/persistence/migrations/005-user-stage-recovery.sql and specs/005-role-return/ untouched.
- Feature number 009 remains available for future work; database migration 009 is part of feature 008’s ordered schema history.
- This task plan does not claim any tests or build have run.

## Phase 8: Convergence

- [X] T044 Extend `tests/unit/guided-notes/layout-recognizer.test.ts` and `server/src/features/guided-notes/domain/layout-recognizer.ts` so a missing question number is rejected with worksheet and row diagnostics when question structure is indicated by merged prompt/answer cells even if the question-number cell is unmerged; retain acceptance of ordinary blank and instruction rows (FR-019, US4 AC).

