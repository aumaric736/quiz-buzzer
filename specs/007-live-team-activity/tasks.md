---
description: "Task list for live team status and writeback"
---

# Tasks: 小組即時狀態與回寫

**Input**: Design documents from `/specs/007-live-team-activity/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included because the project constitution requires normal and boundary coverage for core features; use Vitest. For each story, add or update tests before implementation and confirm the new tests fail for the missing behavior.

**Organization**: Tasks follow the four P1 user stories in `spec.md`. Audience-scoped event infrastructure is foundational because the stories depend on the same authorization, snapshots, and revision rules.

## Phase 1: Setup

**Purpose**: Provide reusable Vitest fixtures for session, WebSocket, clock, and Sheets scenarios used by this feature.

- [X] T001 [P] Add reusable live-team fixtures for online/offline sessions, controlled time, connected WebSocket clients, and fake Sheets grids in `tests/helpers/live-team-activity.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add persistence and shared event contracts required by every user story. Preserve audience isolation and existing activity phase revision semantics.

- [X] T002 [P] Add migration integration tests that both live revision columns default to 0, reject negative values, and leave the existing phase revision unchanged in `tests/integration/user-stage-sync/live-revision-migration.test.ts`.
- [X] T003 Add SQLite migration `server/src/features/user-stage-sync/persistence/migrations/008-live-team-activity.sql` with teacher-only `activities.live_revision` and group-scoped `groups.live_revision`, both initialized to 0 and nonnegative.
- [X] T004 [P] Define `ActivityRosterUpdatedEvent`, `TeamPresenceUpdatedEvent`, `ActivityTeamAnswerUpdatedEvent`, role-scoped snapshot types, and group roster/join fields in `shared/src/user-stage-sync/contracts.ts` and `shared/src/buzzer-flow/contracts.ts`; `onlineCount` is 0–2, `occupiedCount` is 0–2, `capacity` is exactly 2, role is `leader`/`member`, teacher events carry monotonic `activityLiveRevision`, and team events carry monotonic `groupLiveRevision`, both separate from student-visible phase revisions.
- [X] T005 [P] Add event parsing, activity/group mismatch, and stale-revision tests in `tests/unit/user-stage-sync/activity-socket.test.ts` for the contracts from T004.
- [X] T006 Implement validation and audience-scoped revision handling for the new event/snapshot contracts in `client/src/features/user-stage-sync/services/activity-socket.ts`.
- [X] T007 [P] Add WebSocket authorization, reconnect snapshot, and cross-group answer privacy tests in `tests/integration/user-stage-sync/live-event-subscriptions.test.ts`.
- [X] T008 Implement authorized teacher/team snapshots and publisher methods in `server/src/features/user-stage-sync/realtime/websocket-server.ts`; derive the student's group from the stored session and send no other team's state.
- [X] T009 Wire the new publishers and role-scoped subscription snapshots through `server/src/app.ts`, including the group routes, buzzer submission routes, and student-presence expiry service; keep state publication after the SQLite transaction commits.

**Checkpoint**: Schema, audience-safe event types, reconnect snapshots, and publishing seams are ready; stories can now use the shared realtime foundation.

---

## Phase 3: User Story 1 - 查看小組人數與身分 (Priority: P1)

**Goal**: Show the currently online member count and the student's role continuously, and remove version-number sublabels from teacher activity phases.

**Independent Test**: Create a group and join a second online session; verify `1/2` and `組長`, then `2/2（已滿額）` and each member's role. Simulate a team-presence event and verify the count updates; verify teacher phase states show no version sublabels.

### Tests for User Story 1

- [X] T010 [P] [US1] Add React acceptance tests for online count, role labels, `2/2（已滿額）`, and removal of teacher phase version labels in `tests/acceptance/user-stage-sync/group-presence-display.test.tsx`.
- [X] T011 [P] [US1] Add group roster/query tests distinguishing online and occupied counts and asserting both live revisions advance exactly once on group creation/member join in `tests/integration/user-stage-sync/group-online-count.test.ts`.

### Implementation for User Story 1

- [X] T012 [P] [US1] Extend `server/src/features/user-stage-sync/persistence/group-repository.ts` so `onlineCount` (range 0–2) counts connected non-retired sessions and `occupiedCount` (range 0–2) includes disconnected non-retired sessions until the two-minute deadline; preserve `capacity` exactly 2.
- [X] T013 [US1] Return the student's `leader`/`member` role, online count, capacity, and reserved-seat state from `server/src/features/user-stage-sync/application/group-service.ts` and `server/src/features/user-stage-sync/api/group-routes.ts`; increment `groups.live_revision` and `activities.live_revision` exactly once in the enrollment transaction, then publish team-presence updates carrying the committed `groupLiveRevision` to existing group sessions.
- [X] T014 [P] [US1] Create `client/src/features/user-stage-sync/components/GroupPresenceStatus.tsx` to display online `1/2` or `2/2（已滿額）`, the current `組長`/`組員` role, and the latest team-presence snapshot.
- [X] T015 [US1] Integrate `GroupPresenceStatus` with the student's activity snapshot and authorized team presence events in `client/src/features/user-stage-sync/views/StudentJoinView.tsx`.
- [X] T016 [P] [US1] Update `client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx` to render online count separately from occupied seats and group join availability.
- [X] T017 [P] [US1] Remove the `版本 {activity.revision}` sublabel from the teacher activity phase panel in `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`.

**Checkpoint**: Joining students see the correct online count and role; temporary disconnect events can reduce the displayed count without implying the reserved seat is free; teacher phase labels contain no version text.

---

## Phase 4: User Story 2 - 即時掌握小組與作答變化 (Priority: P1)

**Goal**: Synchronize group creation, member changes, and submitted answers to the teacher and same-team students within two seconds, with student visibility limited to their own team.

**Independent Test**: Open teacher and two same-team sessions plus a second team; create/join a group and submit an answer. Verify teacher and same-team screens update without reload, other-team screens reveal no answer, and the 100-group/200-session acceptance scenario meets the two-second target.

### Tests for User Story 2

- [X] T018 [P] [US2] Add integration tests for group create/join roster events, monotonic `activityLiveRevision`/`groupLiveRevision`, first-answer revision increments, same-team answer updates, teacher-wide answer visibility, and no cross-team student leakage in `tests/integration/user-stage-sync/live-team-realtime.test.ts`.
- [X] T019 [P] [US2] Add a 100-group/200-session end-to-end realtime capacity test that starts timing when a state change commits and verifies every authorized connected view renders the newest state within two seconds; event receipt or state application alone does not pass in `tests/integration/user-stage-sync/live-team-capacity.test.ts`.
- [X] T020 [P] [US2] Add React acceptance tests that start timing at the simulated successful state commit and verify teacher roster/answer updates and same-team submitted-answer changes are rendered in the UI within two seconds, without page reload, in `tests/acceptance/user-stage-sync/live-activity-updates.test.tsx`.

### Implementation for User Story 2

- [X] T021 [P] [US2] Publish teacher-wide roster updates after group creation and membership joins using the committed `activityLiveRevision` persisted by T013 in `server/src/features/user-stage-sync/api/group-routes.ts` and `server/src/features/user-stage-sync/application/group-service.ts`; do not increment the revision a second time.
- [X] T022 [P] [US2] Increment `groups.live_revision` and `activities.live_revision` in the same transaction as a first valid answer submission in `server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts`.
- [X] T023 [US2] Publish one team-scoped answer update to that team's active sessions and an activity-scoped answer update to the authenticated teacher after commit in `server/src/features/buzzer-flow/api/buzzer-flow-routes.ts`.
- [X] T024 [P] [US2] Apply roster and team-answer events to teacher roster/question state without waiting for a page reload in `client/src/features/user-stage-sync/views/TeacherActivityView.tsx` and `client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx`.
- [X] T025 [P] [US2] Apply the group's submitted state and original answer parts to all same-team student screens in `client/src/features/user-stage-sync/views/StudentJoinView.tsx` and `client/src/features/buzzer-flow/views/StudentAnswerView.tsx`.

**Checkpoint**: New groups, online membership changes, and group answers appear in the right screens within two seconds; students cannot read another team's answer or status.

---

## Phase 5: User Story 3 - 安全預覽並回寫學習單 (Priority: P1)

**Goal**: Write each answer in the specified group/answer format only when every target is blank; reject occupied targets as one batch and allow expired previews to be regenerated.

**Independent Test**: Confirm a preview for blank targets and check exact cell text; separately exercise visible content, `0`, `false`, whitespace-only values, formulas returning empty text, all-or-nothing rejection, and an expired preview followed by a successful regenerated preview.

### Tests for User Story 3

- [X] T026 [P] [US3] Add unit tests for target-cell blank detection: trim ASCII/full-width whitespace, tabs, and line breaks; preserve `0` and `false` as occupied; always treat formulas as occupied in `tests/unit/guided-notes/target-cell-blank.test.ts`.
- [X] T027 [P] [US3] Extend preview/confirmation integration tests for mapped occupied cells, all-target preflight, zero writes on any occupied target, exact group/answer formatting, and five-minute expiry in `tests/integration/guided-notes/export-confirmation.test.ts` and `tests/integration/guided-notes/export-preview.test.ts`.
- [X] T028 [P] [US3] Extend preview UI acceptance tests for occupied-cell errors and regenerate-preview recovery after expiry in `tests/acceptance/guided-notes/export-preview.test.tsx`.

### Implementation for User Story 3

- [X] T029 [US3] Preserve explicit formula presence in `SheetsCell` and expose formula metadata from the Google API response in `server/src/features/guided-notes/google-sheets/sheets-gateway.ts` and `server/src/features/guided-notes/google-sheets/google-sheets-gateway.ts`.
- [X] T030 [US3] Extend `GuidedNotesExportPreviewItem` with occupied target labels in `shared/src/guided-notes/contracts.ts`; resolve target coordinates from stored mappings independently of blank content and return all target labels/current occupancy in `server/src/features/guided-notes/domain/layout-recognizer.ts` and `server/src/features/guided-notes/application/build-export-preview.ts`.
- [X] T031 [US3] Set `expiresAt` to exactly five minutes after successful preview creation and make expiration return a recoverable state that permits a new preview ID in `server/src/features/guided-notes/application/build-export-preview.ts` and `server/src/features/guided-notes/application/confirm-guided-notes-export.ts`.
- [X] T032 [US3] Before any Sheets write, validate every mapped target atomically: full-width spaces, tabs, and line breaks trim as whitespace; formulas are occupied even when their result is empty; reject the whole batch with all affected labels and perform zero writes in `server/src/features/guided-notes/application/confirm-guided-notes-export.ts`.
- [X] T033 [US3] Write each winning slot exactly as `小組：{displayName}。回答：{answerPart}。`, using the group's persisted display name (which may be a name or code), preserve the original answer text, and leave no-winner slots unchanged in `server/src/features/guided-notes/application/confirm-guided-notes-export.ts`.
- [X] T034 [P] [US3] Add visible five-minute expiry handling, occupied-target guidance, and a regenerate-preview action in `client/src/features/guided-notes/views/GuidedNotesExportPreview.tsx` and `client/src/features/guided-notes/services/export-preview-api.ts`.

**Checkpoint**: A stale preview can be replaced; any occupied target blocks every write and is identified; successful cells contain the requested group/answer text.

---

## Phase 6: User Story 4 - 回收長期離線的成員席位 (Priority: P1)

**Goal**: Restore the original session within two minutes; after the deadline retire and clear its identity, release member seats, close new enrollment on leader expiry, publish the changed count, and require a new identity.

**Independent Test**: Verify restoration just before 120 seconds; at the deadline verify the old session cannot recover, a member seat is released once, new member enrollment works only while the leader is valid, leader expiry closes enrollment, and other active members remain usable.

### Tests for User Story 4

- [X] T035 [P] [US4] Extend session recovery integration tests for immediately reduced online count, restore before 120 seconds, expiry at 120 seconds, old-session rejection, and release of a member seat only at the deadline in `tests/integration/user-stage-sync/session-restore.test.ts`.
- [X] T036 [P] [US4] Add leader-expiry, group-closure, same-deadline join race, presence-event audience checks, and monotonic `activityLiveRevision`/`groupLiveRevision` assertions for disconnect, restore, and expiry in `tests/integration/user-stage-sync/team-session-expiry.test.ts`.
- [X] T037 [P] [US4] Add acceptance tests that the old browser session is cleared and must enter the new-member flow after expiry in `tests/acceptance/user-stage-sync/expired-session-flow.test.tsx`.

### Implementation for User Story 4

- [X] T038 [US4] On disconnect, restore, member expiry, and leader expiry, increment `groups.live_revision` and `activities.live_revision` in the same presence transaction; at/after the two-minute deadline atomically retire and clear the old session, release a member seat exactly once, and set `acceptsMembers` false for an expired leader. After commit, publish team presence with `groupLiveRevision` and teacher roster with `activityLiveRevision` from `server/src/features/user-stage-sync/application/student-session-presence-service.ts`.
- [X] T039 [US4] Ensure expiry/join races use one serialized transaction and that the expired leader's closure wins over a same-deadline join in `server/src/features/user-stage-sync/application/group-service.ts` and `server/src/features/user-stage-sync/application/student-session-presence-service.ts`.
- [X] T040 [P] [US4] Clear locally retained expired student session state and route the student to new-member enrollment when the server rejects the expired identity in `client/src/features/user-stage-sync/services/session-restore.ts` and `client/src/features/user-stage-sync/components/ApplicationShell.tsx`.

**Checkpoint**: Deadline boundaries, role-specific expiry behavior, seat release, realtime online counts, and old-session revocation all match the two-minute policy.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the combined feature, preserve design alignment, and update operational documentation.

- [X] T041 [P] Review WebSocket, buzzer submission, and Sheets error responses/logging in `server/src/api/error-middleware.ts`, `server/src/features/user-stage-sync/realtime/websocket-server.ts`, `server/src/features/buzzer-flow/api/buzzer-flow-routes.ts`, `server/src/features/guided-notes/application/build-export-preview.ts`, `server/src/features/guided-notes/application/confirm-guided-notes-export.ts`, and `server/src/features/guided-notes/google-sheets/google-sheets-gateway.ts`; confirm errors are actionable and neither responses nor logs expose credentials, keys, or raw provider payloads.
- [X] T042 [P] Update the component, class, and sequence diagrams in `diagrams/007-live-team-activity-component.puml`, `diagrams/007-live-team-activity-class.puml`, and `diagrams/007-live-team-activity-sequence.puml` if implementation differs from the design; render each PNG using the project PlantUML command.
- [X] T043 Run the feature scenarios in `specs/007-live-team-activity/quickstart.md`, including Vitest unit/integration/acceptance checks, production build, and the 100-group/200-session delivery check; record results in `specs/007-live-team-activity/implementation-report.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; creates fixtures used by later tests.
- **Foundational (Phase 2)**: Depends on setup; blocks all stories because event revisions, shared payload types, subscription snapshots, and authorization must agree first.
- **User Stories (Phases 3–6)**: Depend on the foundation. Phase numbering follows the spec for traceability, not a mandatory delivery order. The MVP path is US1 → US4; US2 follows US1 because it extends those views, while US3 is independent and may be delivered separately.
- **Polish (Phase 7)**: Depends on all four stories.

### User Story Dependencies

- **US1 (P1)**: Depends on the shared contracts and snapshot/event infrastructure. Its UI can be tested with presence events; production disconnect/expiry event behavior is completed by US4.
- **US2 (P1)**: Depends on the shared publisher and revision foundation. It adds group/answer state changes and applies them to the screens introduced in US1.
- **US3 (P1)**: Depends only on the shared project foundation; otherwise independent from US1, US2, and US4.
- **US4 (P1)**: Depends on the team-presence publisher from Phase 2; pair it with US1 for the MVP because its presence service changes complete online counts in US1 and roster updates in US2.

### Within Each User Story

- Add or extend that story's tests before implementation and verify the missing behavior is detected.
- Keep persistence/revision changes before service publication and UI consumption.
- For writeback, preserve the order: map targets → preflight all cells → write batch → verify/reconcile result.
- For expiry, preserve the order: deadline validation → transactionally retire/release/close → publish the committed presence snapshot.

### Parallel Opportunities

- **Phase 1**: T001 can run independently.
- **Phase 2**: T002 and T004 can proceed in parallel; T005 is independent once T004's types are agreed. Server migration and shared contracts touch separate files.
- **US1**: T010 and T011 are independent tests. T014, T016, and T017 touch separate UI files after the shared response shape is available.
- **US2**: T018, T019, and T020 are independent test files. Server submission/revision work and client view work can proceed in parallel after event contracts and publisher APIs stabilize.
- **US3**: T026, T027, and T028 are separate test files and can proceed in parallel. The gateway formula metadata change (T029) can proceed alongside client preview work (T034) after contracts are agreed.
- **US4**: T035, T036, and T037 are separate test files and can proceed in parallel. Server lifecycle work and client expired-session handling touch separate layers.

### Dependency Graph

```text
T001 -> T002 -> T003
       T004 -> T005 -> T006
        |     T007 -> T008 -> T009
                         |
                         +--> US1 (T010-T017) --> US4 (T035-T040), MVP presence path
                         +--> US2 (T018-T025), after/in parallel with US4; integrates US1 views
                         +--> US3 (T026-T034), independent feature area

US1 + US2 + US3 + US4 -> Polish (T041-T043)
```

## Parallel Example: User Story 3

```text
Task: T026 target-blank unit tests in tests/unit/guided-notes/target-cell-blank.test.ts
Task: T027 preview/confirmation integration tests in tests/integration/guided-notes/export-confirmation.test.ts and export-preview.test.ts
Task: T028 regeneration UI tests in tests/acceptance/guided-notes/export-preview.test.tsx
```

These test files can be authored concurrently; production changes begin after their expected failures are confirmed.

## Parallel Examples: Other User Stories

### User Story 1

```text
Task: T010 UI acceptance tests in tests/acceptance/user-stage-sync/group-presence-display.test.tsx
Task: T011 online/occupied-count tests in tests/integration/user-stage-sync/group-online-count.test.ts
```

After the response fields are agreed, the group status component, teacher roster component, and phase-label cleanup touch separate UI files:

```text
Task: T014 GroupPresenceStatus.tsx
Task: T016 TeacherGroupRoster.tsx
Task: T017 TeacherActivityView.tsx
```

### User Story 2

```text
Task: T018 event authorization and visibility tests in tests/integration/user-stage-sync/live-team-realtime.test.ts
Task: T019 capacity test in tests/integration/user-stage-sync/live-team-capacity.test.ts
Task: T020 screen update tests in tests/acceptance/user-stage-sync/live-activity-updates.test.tsx
```

After those tests are defined, teacher roster publication (T021) and answer transaction revisions (T022) touch separate server files and can proceed concurrently.

### User Story 4

```text
Task: T035 session restore tests in tests/integration/user-stage-sync/session-restore.test.ts
Task: T036 leader expiry/race tests in tests/integration/user-stage-sync/team-session-expiry.test.ts
Task: T037 expired-session UI tests in tests/acceptance/user-stage-sync/expired-session-flow.test.tsx
```

After the tests are authored, server presence publication (T038) and client expired-session clearing (T040) touch separate layers and can proceed concurrently; transaction race behavior (T039) follows T038.

## Implementation Strategy

### MVP First

The minimum useful release is the shared realtime foundation plus **US1 and US4**. US1 shows online count and role; US4 makes that count truthful through disconnect, recovery, expiry, and leader closure. Delivering US1 without US4 would leave the displayed “online” count stale during the two-minute grace period.

### Incremental Delivery

1. Complete Phase 1 and Phase 2; verify schema and authorized event contracts.
2. Deliver US1 for accurate join-time online counts and role display, with team join events.
3. Deliver US4 next as the required MVP companion, making US1's online count accurate through disconnect, recovery, expiry, and stale-session revocation.
4. Deliver US2 for teacher activity-wide roster and student team-scoped answer updates.
5. Deliver US3 for safe, recoverable Sheets writeback.
6. Run combined quickstart, build, and capacity acceptance; update implementation report and diagrams.

## Notes

- Every task has an ID, checkbox, applicable story label, and concrete file path.
- `[P]` is used only where files are independent; tasks sharing a file or awaiting a dependency are not marked parallel.
- All four stories are P1; MVP combines US1 and US4 because the online-count display depends on correct presence expiry.

## Phase 8: Convergence

- [X] T044 [US2] Add capacity acceptance coverage that feeds group creation, member join, disconnect/seat-release, and answer WebSocket events through the same client state transitions used by `TeacherActivityView` and `StudentJoinView`, then verifies the rendered authorized screens within two seconds at 100 groups and 200 sessions; replace synthetic post-event view props with event-derived state and fix any discrepancies per FR-005, US2/AC6, T019-T020 (partial).

## Phase 9: Convergence

- [X] T045 [US4] Reconcile expired sessions before opening the enrollment transaction or otherwise preserve expiry commits when a join is rejected, and publish team-presence plus teacher-roster snapshots for every affected group/activity after commit; add same-deadline leader-join and multi-activity expiry-triggered-by-join tests per FR-005, FR-014, US4/AC4-5, T038-T039 (partial).
