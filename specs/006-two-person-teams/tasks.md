# Tasks: 小組活動與逐題搶答

**Input**: Design documents from `/specs/006-two-person-teams/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/api-contracts.md`, `quickstart.md`

**Tests**: Included because the project constitution requires normal and boundary coverage for every core feature. This task-generation step does not run tests.

**Organization**: Tasks are grouped into the five P1 stories from the specification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable with other marked tasks in the same phase; edits distinct files and has no unfinished prerequisite.
- **[Story]**: Story tasks use `[US1]` through `[US5]`. Setup, foundational, and polish tasks have no story label.
- Every task includes its exact intended file path.

## Phase 1: Setup

**Purpose**: Prepare configuration documentation for classroom LAN operation.

- [X] T001 Add placeholder names and local/LAN usage notes for teacher credentials and host/origin settings in `.env.example`.

## Phase 2: Foundational

**Purpose**: Add the persistence, shared contracts, and ordered-operation primitives needed by all stories.

- [X] T002 Add forward-only group invite-code, group leader/session role, student disconnect deadline, teacher deadline, and operation receipt schema in `server/src/features/user-stage-sync/persistence/migrations/006-two-person-teams.sql` and `server/src/features/user-stage-sync/persistence/migrations/007-answer-receipts.sql`.
- [X] T003 [P] Extend activity, session, group, membership, join, and error contracts in `shared/src/user-stage-sync/contracts.ts`.
- [X] T004 [P] Extend one-question submission, student status, teacher live view, and final result contracts in `shared/src/buzzer-flow/contracts.ts`.
- [X] T005 [P] Extend durable export attempt and retry status contracts in `shared/src/guided-notes/contracts.ts`.
- [X] T006 Implement per-activity serialized operation sequencing shared by answers and activity end in `server/src/features/buzzer-flow/application/activity-operation-queue.ts`.
- [X] T007 Persist unique activity operation receipts without answer content in `server/src/features/buzzer-flow/persistence/activity-operation-repository.ts`.
- [X] T008 Validate configured teacher credentials and LAN bind/origin settings in `server/src/config/env.ts`.
- [X] T009 Test migration fields, activity-scoped invite-code uniqueness, and operation-receipt sequence constraints in `tests/integration/user-stage-sync/schema.test.ts`.

**Checkpoint**: The database and shared API types can represent the clarified team sessions, invite codes, deadlines, and ordered operations.

## Phase 3: User Story 1 - 教師建立活動與匯入題目 (Priority: P1)

**Goal**: A configured teacher signs in, creates one owned activity, imports Guided Notes questions, and receives the activity join code.

**Independent Test**: Authenticate with configured credentials, create/import an activity, verify its join code, and confirm another teacher cannot claim its ownership.

### Tests for User Story 1

- [X] T010 [P] [US1] Test valid/invalid credentials, generic login errors, and authenticated teacher session issuance in `tests/integration/user-stage-sync/teacher-auth-activity.test.ts`.
- [X] T011 [P] [US1] Test activity create/import/join-code flow and rejection of competing teacher ownership in `tests/acceptance/user-stage-sync/teacher-activity-setup.test.ts`.

### Implementation for User Story 1

- [X] T012 [US1] Implement server-only configured credential validation and teacher session issuance in `server/src/features/user-stage-sync/application/teacher-auth-service.ts`.
- [X] T013 [US1] Add the login endpoint and owner-session guard for activity routes in `server/src/features/user-stage-sync/api/teacher-routes.ts`.
- [X] T014 [US1] Enforce one activity owner and return the existing activity ID as its join code in `server/src/features/user-stage-sync/application/activity-service.ts`.
- [X] T015 [US1] Add teacher login and authenticated activity/import flow in `client/src/features/user-stage-sync/components/RoleSelector.tsx`.
- [X] T016 [US1] Display and copy the activity join code after creation in `client/src/features/user-stage-sync/components/ActivityJoinCode.tsx`.

**Checkpoint**: Teacher setup works independently, and invalid credentials or a competing owner are rejected.

## Phase 4: User Story 2 - 學生加入活動並建立或加入小組 (Priority: P1)

**Goal**: Students create or join groups using random fixed-width six-character numeric invite-code strings (leading zeroes valid), with a 100-group cap and at most two active membership sessions per group.

**Independent Test**: Create groups and join via invite code; verify fixed-width six-character numeric strings including leading zeroes, same-activity uniqueness/collision retry, rejection of a third active session and group 101, activity-scoped codes, and teacher visibility limited to invite code plus active session count.

### Tests for User Story 2

- [X] T017 [P] [US2] Test random fixed-width six-character numeric-string format, leading zeroes, collision retry, same-activity uniqueness, cross-activity reuse, and 100-group boundary in `tests/integration/user-stage-sync/groups-api.test.ts`.
- [X] T018 [P] [US2] Test two active membership sessions, rejection of a third, same-session multiple sockets counting as one seat, and unlimited invalid-code attempts in `tests/integration/user-stage-sync/group-session-capacity.test.ts`.

- [X] T019 [P] [US2] Test teacher roster exposes invite codes and active session counts but no names, student numbers, or session IDs in `tests/acceptance/user-stage-sync/group-roster-privacy.test.ts`.

### Implementation for User Story 2

- [X] T020 [US2] Generate an invite code with Node `crypto.randomInt`, format it as a fixed-width six-character numeric string preserving leading zeroes, retry same-activity collisions atomically, and store it with activity-scoped uniqueness in `server/src/features/user-stage-sync/persistence/group-repository.ts`.
- [X] T021 [US2] Replace free-form group-name enrollment with leader/member session creation, capacity checks, invite-code lookup, and no invalid-code attempt counter in `server/src/features/user-stage-sync/application/group-service.ts`.
- [X] T022 [US2] Implement activity join and leader/member group enrollment request validation in `server/src/features/user-stage-sync/api/group-routes.ts`.
- [X] T023 [US2] Set a two-minute deadline when a session's last socket closes unexpectedly, and cancel it when that same session reconnects in `server/src/features/user-stage-sync/realtime/websocket-server.ts`.
- [X] T024 [US2] Return teacher-only invite-code and active-session-count projections in `server/src/features/user-stage-sync/application/group-roster-service.ts`.
- [X] T025 [US2] Add activity-code entry, leader/member selection, group creation, and fixed-width six-character invite-code join UI that preserves leading zeroes in `client/src/features/user-stage-sync/views/StudentJoinView.tsx`.
- [X] T026 [US2] Render the teacher roster with invite codes and active session counts only in `client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx`.

**Checkpoint**: Enrollment enforces session seats and group limits server-side; group codes are random, activity-scoped, and do not disclose group order/count.

## Phase 5: User Story 3 - 逐題提交搶答 (Priority: P1)

**Goal**: Each question has its own submit action; the first valid complete request wins, and student live views disclose only the caller team's state.

**Independent Test**: Submit multiple questions independently from different teams; verify invalid attempts do not consume eligibility, the first valid receipt wins, retries preserve the first raw answer, and students receive no other-team data.

### Tests for User Story 3

- [X] T027 [P] [US3] Test question membership, blank/shape validation, original raw answer preservation, first-valid lock, and exact/changed retries in `tests/unit/buzzer-flow/buzzer-flow-service.test.ts`.
- [X] T028 [P] [US3] Test concurrent groups, same-group multi-session submissions, receipt ordering, answer/end races, and one winner per question in `tests/integration/buzzer-flow/answer-receipt-ordering.test.ts`.
- [X] T029 [P] [US3] Test student REST and WebSocket projections exclude other-team answers/status, counts, winner, and global sequence in `tests/acceptance/buzzer-flow/student-answer-privacy.test.ts`.

### Implementation for User Story 3

- [X] T030 [US3] Validate live phase, group session, imported question/blank shape, nonblank-after-trim content, and first-valid eligibility in `server/src/features/buzzer-flow/application/buzzer-flow-service.ts`.
- [X] T031 [US3] Persist original answer strings and assign rank/winner from the shared activity receipt sequence in `server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts`.
- [X] T032 [US3] Add the one-question submission route and caller-group-only acknowledgment/status response in `server/src/features/buzzer-flow/api/buzzer-flow-routes.ts`.
- [X] T033 [US3] Publish teacher-only complete live submissions and student-private acknowledgments in `server/src/features/user-stage-sync/realtime/websocket-server.ts`.
- [X] T034 [US3] Add independent question drafts and per-question submit buttons in `client/src/features/buzzer-flow/views/StudentAnswerView.tsx`.
- [X] T035 [US3] Render live receipt order and submissions in the authenticated teacher review view in `client/src/features/buzzer-flow/components/QuestionResultList.tsx`.

**Checkpoint**: Each group gets one answer per question; another group's submission never locks its peers or appears in student live data.

## Phase 6: User Story 4 - 恢復活動、組別與作答 (Priority: P1)

**Goal**: Refresh/reconnect restores the original session within two minutes; expired-session invite-code rejoin creates a new seat only if one is free; drafts remain device-local.

**Independent Test**: Submit one question and draft another, refresh/reconnect inside two minutes, then expire and rejoin with the activity and invite codes; verify seat handling, original team submissions, local-only drafts, and no answer transfer when switching groups.

### Tests for User Story 4

- [X] T036 [P] [US4] Test two-minute reconnect restoration, deadline expiry, new-session rejoin with an open seat, rejection when full, and original group answer ownership in `tests/integration/user-stage-sync/session-restore.test.ts`.
- [X] T037 [P] [US4] Test activity/group/question draft persistence on the original device only and no cross-group draft leakage in `tests/acceptance/buzzer-flow/draft-recovery.test.ts`.

### Implementation for User Story 4

- [X] T038 [US4] Reconcile expired student disconnect deadlines on startup and retire sessions/free seats at deadline in `server/src/features/user-stage-sync/application/student-session-presence-service.ts`.
- [X] T039 [US4] Restore the same active student session before its deadline and create a new group session only through the capacity-checked invite-code flow after expiry in `server/src/features/user-stage-sync/application/session-service.ts`.
- [X] T040 [US4] Return the caller group's submitted answers and own receipt state only in `server/src/features/user-stage-sync/api/answer-status-routes.ts`.
- [X] T041 [US4] Persist unsent answer drafts by activity, group, and question in `client/src/features/buzzer-flow/services/question-draft-store.ts`.
- [X] T042 [US4] Restore activity, group, and submitted answer state on reload/reconnect in `client/src/features/user-stage-sync/services/session-restore.ts`.

**Checkpoint**: Reconnect retains the original seat for two minutes; after expiry a new invite-code session requires an open seat, while submitted answers remain attached to their original group.

## Phase 7: User Story 5 - 組員離開及活動結束後瀏覽結果 (Priority: P1)

**Goal**: Leader departure closes new joins; member departure frees a seat while the leader remains. Teacher leave/timeout freezes results; anyone with the activity join code can read final results without a group session or seat.

**Independent Test**: Verify leader/member leave and expiry rules, teacher end ordering, public read-only result access by activity code only after end, mutation rejection, no-winner output, and retryable Sheets export.

### Tests for User Story 5

- [X] T043 [P] [US5] Test explicit leader leave/expiry closes enrollment while an active member continues, and member leave/expiry frees a seat when the leader remains in `tests/integration/user-stage-sync/group-departure.test.ts`.
- [X] T044 [P] [US5] Test teacher explicit end, two-minute disconnect grace/reconnect/startup expiry, and ordering against submissions in `tests/integration/user-stage-sync/teacher-presence-end.test.ts`.
- [X] T045 [P] [US5] Test final-results lookup by activity code without a session/seat, rejection while live, ended mutation rejection, no-winner output, and export retry in `tests/acceptance/guided-notes/final-results-export-retry.test.ts`.

### Implementation for User Story 5

- [X] T046 [US5] Close groups to new sessions on leader explicit leave or two-minute session expiry; release a member seat on explicit leave/expiry while leader is active in `server/src/features/user-stage-sync/application/group-service.ts`.
- [X] T047 [US5] Persist teacher last-socket disconnect deadline, cancel on owner reconnect, and reconcile expiry after startup in `server/src/features/user-stage-sync/application/teacher-presence-service.ts`.
- [X] T048 [US5] Order teacher leave/timeout with answer receipts, freeze all question results once, and reject later mutations in `server/src/features/user-stage-sync/application/activity-service.ts`.
- [X] T049 [US5] Add a no-session final-results endpoint that requires an ended activity and activity join code, returns all immutable results, and never creates or consumes a group seat in `server/src/features/buzzer-flow/api/final-results-routes.ts`.
- [X] T050 [US5] Persist pending/failed/unknown Guided Notes attempts and safe post-end retry without changing final results in `server/src/features/guided-notes/application/export-retry-service.ts`.
- [X] T051 [US5] Fetch ended results using only the activity join code, render them, and disable student mutations in `client/src/features/user-stage-sync/views/StudentJoinView.tsx`.
- [X] T052 [US5] Show final results and export status/retry controls to the teacher using T050's retry-state and safe-retry service in `client/src/features/guided-notes/views/GuidedNotesExportResult.tsx`.

**Checkpoint**: Ended results are immutable and available by activity code alone; group seat state and export failures cannot block or mutate read-only result access.

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Align deployment instructions, security boundaries, diagrams, and the clarified full-capacity acceptance with the completed feature.

- [X] T053 [P] Update classroom LAN, invite-code, two-seat, reconnect, result-access, and validation instructions in `specs/006-two-person-teams/quickstart.md`.
- [X] T054 [P] Review credential storage/logging, shared invite-code handling, answer privacy, and final-results read access in `server/src/features/user-stage-sync/application/teacher-auth-service.ts`, `server/src/features/user-stage-sync/api/group-routes.ts`, `server/src/features/buzzer-flow/api/buzzer-flow-routes.ts`, and `server/src/features/buzzer-flow/api/final-results-routes.ts`.
- [X] T055 [P] Reconcile implementation with the repository-root component, class, and sequence diagrams in `diagrams/006-two-person-teams-component.puml`, `diagrams/006-two-person-teams-class.puml`, and `diagrams/006-two-person-teams-sequence.puml`.
- [X] T056 Verify 100 groups can each hold two active sessions and all 200 sessions can join and appear in the roster; submit one valid answer per group, confirm the other session sees the shared answer, and confirm its duplicate submission creates no second accepted answer in `tests/integration/user-stage-sync/group-session-capacity.test.ts`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 has no dependencies.
- **Foundational (Phase 2)**: Depends on T001. T002 establishes schema; T003–T005 define separate shared contracts; T006–T007 establish ordered receipts; T008 configures environment; T009 verifies migration constraints. All foundation tasks must complete before story implementation.
- **User Stories (Phases 3–7)**: Depend on Foundation and follow spec priority. Each story has an independent test path using seeded activities/teams where earlier UI flows are not present.
- **Polish (Phase 8)**: Depends on all selected stories.

### User Story Dependencies

- **US1 (P1)**: Depends on Foundation; no dependency on other stories.
- **US2 (P1)**: Depends on Foundation and uses activities from US1 in the integrated flow; can be tested with seeded activities.
- **US3 (P1)**: Depends on Foundation and group identity from US2; can be tested with seeded group sessions.
- **US4 (P1)**: Integrates US2 and US3 session/submission state; can be independently tested with seeded persisted sessions and answers.
- **US5 (P1)**: Integrates activity, group, answer, and export state; can be independently tested with seeded data.
- **Capacity acceptance (T056)**: Depends on the integrated US2 enrollment and teacher roster plus US3 answer submission paths. Execute after the US5 terminal-results MVP slice (T048–T052) and before optional US4 recovery; it is a required MVP exit gate and verifies one accepted answer per group shared across both sessions.

### Parallel Opportunities

- T003, T004, and T005 touch different shared contract files and can proceed in parallel after migration assumptions are agreed.
- Within every story, its `[P]` tests touch separate test files and can be authored together before implementation.
- In US2, student join UI (T025) and teacher roster UI (T026) can proceed in parallel after contracts; server join and code persistence remain dependency-ordered.
- In Polish, quickstart documentation, access-boundary review, and diagram reconciliation touch separate files and can proceed in parallel after story completion.
- US1–US5 can be split across contributors after Foundation for seeded-data subfeature work, but integrated acceptance should follow story dependencies. Shared files (`group-service.ts`, `StudentAnswerView.tsx`, and activity lifecycle services) must be edited in their listed order.

## Parallel Examples by User Story

```text
US1: T010 credential/ownership integration tests and T011 teacher setup acceptance tests.
US2: T017 invite-code/cap tests, T018 session-capacity tests, and T019 roster privacy tests.
US3: T027 validation/retry unit tests, T028 receipt-order integration tests, and T029 privacy acceptance tests.
US4: T036 session restore integration tests and T037 device-local draft acceptance tests.
US5: T043 group departure tests, T044 teacher end/presence tests, and T045 final-results/export acceptance tests.
```

## Implementation Strategy

### MVP First

The minimum usable classroom workflow needs **US1 + US2 + US3 + the terminal-results slice of US5 (T048, T049, T050, T051, and T052), plus the mandatory capacity acceptance T056**: teacher setup, team enrollment, per-question answers, teacher end, read-only result publication with export status and safe retry, and validation of 100 groups/200 sessions with one accepted answer per group. T056 must pass before the MVP is declared ready. US4 recovery improves resilience; remaining US5 departure/export retry behavior completes lifecycle reliability.

### Incremental Delivery

1. Complete Setup and Foundation.
2. Deliver US1; verify login, activity ownership, and question import.
3. Deliver US2; verify invite-code collision and seat-capacity boundaries.
4. Deliver US3; verify receipt ordering, retries, and student privacy.
5. Deliver US5 terminal end/results slice (T048–T052, including T050 retry-state service) for an end-to-end classroom MVP.
6. Run T056 as a mandatory MVP exit gate: verify all 200 sessions can join and appear in the roster, while each group contributes only one accepted answer shared with its other session.
7. Deliver US4 recovery and remaining US5 departure/export retry cases.
8. Complete the remaining Polish and design alignment tasks.

## Notes

- `[P]` means distinct files and no unmet dependencies; do not parallelize shared-file edits.
- Tests are included to satisfy the constitution's normal and boundary coverage rule. They are not run by this task-generation command.
- Invite codes are fixed-width six-character numeric strings, preserve leading zeroes, and are unique only within the activity. Invalid-code attempt counts are intentionally unlimited.
- Two active membership sessions are enforceable; the application does not identify or verify two distinct people.
