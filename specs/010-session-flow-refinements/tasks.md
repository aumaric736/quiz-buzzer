---
description: "Task list for session flow refinements"
---

# Tasks: Session Flow Refinements

**Input**: Design documents from `/specs/010-session-flow-refinements/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Included because the project constitution requires normal and boundary tests for each core feature. Use the existing Vitest suite; do not add a test framework.

**Organization**: Tasks are grouped by the three user stories in `spec.md`. US1 and US2 are independent; US3 depends on the handoff behavior from US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with another marked task because it changes separate files and has no unfinished dependency.
- **[Story]**: Maps a task to a user story in `spec.md`.
- Every task includes the exact repository file path it changes.

## Path Conventions

- Client: `client/src/`
- Server: `server/src/`
- Shared contracts: `shared/src/`
- Tests: `tests/unit/`, `tests/integration/`, and `tests/acceptance/`

## Phase 1: Setup

**Purpose**: Project setup

No setup tasks are needed. The repository already has TypeScript workspaces, React/Vite/Tailwind dependencies, and Vitest configured.

---

## Phase 2: Foundational

**Purpose**: Blocking prerequisites for user stories

No new foundational infrastructure is needed. Reuse existing SQLite transactions, WebSocket presence publishers, revision fields, and Vitest fixtures. US1 and US2 can start independently.

---

## Phase 3: User Story 1 - Teacher advances an activity (Priority: P1)

**Goal**: Keep 「開始加入」 and 「開始答題」 visible side by side while enabling only the current action; disable both once answering starts.

**Independent Test**: Before joining opens, both buttons are visible with only 「開始加入」 enabled; after opening joining, only 「開始答題」 is enabled; after answering starts and after the activity ends, both remain visible and disabled.

### Tests for User Story 1

- [X] T001 [US1] Update teacher phase acceptance tests for both buttons' visibility and enabled/disabled states before joining, after joining opens, during answering, and after activity end in `tests/acceptance/buzzer-flow/teacher-phase-flow.test.tsx` and `tests/acceptance/user-stage-sync/team-joining-open.test.tsx`.

### Implementation for User Story 1

- [X] T002 [P] [US1] Keep 「開始加入」 and 「開始答題」 rendered together and derive enabled state from `phase`, `joiningOpenedAt`, and `busy`, preserving error handling and the separate 「結束活動」 action in `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`.

---

## Phase 4: User Story 2 - Team continues after leader departure (Priority: P1)

**Goal**: During `準備中`, promote the remaining online member when a leader leaves, preserve two online seats, and make a leaderless empty team usable by its next joiner.

**Independent Test**: Exercise explicit return and timeout, verify the successor role and join availability, verify 29,999/30,000 ms presence boundary, verify a returning former leader cannot reclaim leadership, and verify first joiner to a leaderless empty team becomes leader.

### Tests for User Story 2

- [X] T003 [P] [US2] Update group departure integration cases for explicit return and heartbeat timeout promotion, joining into the vacated online seat, an empty team remaining joinable, and the first joiner to a leaderless empty team becoming leader in `tests/integration/user-stage-sync/group-departure.test.ts`.
- [X] T004 [P] [US2] Add fake-timer checks that a leader is online at 29,999 ms and offline at 30,000 ms, is not promoted outside `準備中`, and cannot reclaim leadership after recovery; preserve reassignment when two other students fill the online seats in `tests/integration/user-stage-sync/phase-aware-presence.test.ts`.

### Implementation for User Story 2

- [X] T005 [US2] Update enrollment and leader handoff logic to enforce at most two online seats, retain disconnected non-retired sessions for recovery without counting them toward online capacity, demote a departed leader, promote the remaining online member or clear `groups.leader_session_id` when there is no successor, and assign leader role to the first student joining an empty group with no current leader in `server/src/features/user-stage-sync/application/group-service.ts`; the helper MUST NOT increment live revisions.
- [X] T006 [P] [US2] Invoke the handoff helper from offline classification after 30,000 ms, keep the transition inside the existing presence transaction, and increment the affected group and activity revisions exactly once before post-commit publication in `server/src/features/user-stage-sync/application/student-session-presence-service.ts`.
- [X] T007 [P] [US2] Invoke the handoff helper before an explicit leader return detaches the session, keep the departure transaction's group and activity revision increments to exactly one each, stop closing `accepts_members` solely because the leader leaves, and preserve the reset response in `server/src/features/user-stage-sync/application/session-service.ts`.

---

## Phase 5: User Story 3 - Participants see leader presence changes (Priority: P2)

**Goal**: Publish the committed leader online state to the teacher roster and the updated recipient role to the team snapshot within five seconds of detecting timeout or explicit return.

**Independent Test**: After leader timeout and explicit return, observe a revisioned teacher roster update and a team presence update; verify the teacher sees current leader status and the remaining student sees its new role.

**Dependencies**: Depends on US2's committed leader handoff and empty-team role assignment.

### Tests for User Story 3

- [X] T008 [P] [US3] Extend realtime event, roster API, and client parser tests to assert `leaderOnline`, promoted `groupRole`, revision ordering, and explicit-return publication in `tests/integration/user-stage-sync/live-team-realtime.test.ts`, `tests/integration/user-stage-sync/live-event-subscriptions.test.ts`, `tests/integration/user-stage-sync/groups-api.test.ts`, and `tests/unit/user-stage-sync/activity-socket.test.ts`.

### Implementation for User Story 3

- [X] T009 [US3] Extend `LiveGroupRosterRecord` and `TeacherGroupRosterItem` with `leaderOnline: boolean` in `shared/src/user-stage-sync/contracts.ts`.
- [X] T010 [P] [US3] Populate the current leader online state in `activity.roster.updated` snapshots while preserving revision ordering and subscriber authorization in `server/src/features/user-stage-sync/realtime/websocket-server.ts`.
- [X] T011 [P] [US3] Include current leader online state in the initial teacher group roster response in `server/src/features/user-stage-sync/application/group-roster-service.ts`.
- [X] T012 [P] [US3] Pass the existing team-presence and roster publishers through `server/src/app.ts` to `server/src/features/user-stage-sync/api/session-routes.ts`, then publish the committed group and roster state after an explicit reset-context return.
- [X] T013 [US3] Validate `leaderOnline` in `client/src/features/user-stage-sync/services/activity-socket.ts` and display leader online status for live and initial roster data in `client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete feature and keep architecture diagrams aligned

- [X] T014 Run the focused and full Vitest commands in `specs/010-session-flow-refinements/quickstart.md` from the repository root `package.json`, including 29,999/30,000 ms presence boundaries; record exact commands and results in the implementation report.
- [X] T015 Compare the implementation with `diagrams/010-session-flow-refinements-component.puml`, `diagrams/010-session-flow-refinements-class.puml`, and `diagrams/010-session-flow-refinements-sequence.puml`, update any divergence, and render the `.puml` files to PNG in `diagrams/` using the repository PlantUML JAR.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No work; existing workspaces and dependencies are ready.
- **Foundational (Phase 2)**: No work; existing transactions, presence publishers, and live revisions support the feature.
- **User Story 1 (Phase 3)**: Can start immediately and is independent of server presence behavior.
- **User Story 2 (Phase 4)**: Can start immediately and is independent of US1.
- **User Story 3 (Phase 5)**: Starts after US2 so tests use completed leader handoff behavior.
- **Polish (Phase 6)**: Starts after all user stories.

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories.
- **US2 (P1)**: No dependencies on other stories.
- **US3 (P2)**: Depends on US2's handoff, leaderless-team join, and committed revisions.

### Within Each User Story

- Write/update tests before their implementation and confirm they fail for missing behavior.
- US2: T003 and T004 can run in parallel; complete T005 before T006 and T007.
- US3: T008 and T009 precede event implementation; T010 and T011 can run in parallel after T009; T012 also requires T007 and can run alongside T010/T011; complete T010-T012 before T013.

## Parallel Opportunities

- T001 (US1) can run alongside T003 and T004 (US2) because they edit different test files.
- T003 and T004 are independent test updates.
- T002 (US1) can run alongside T005-T007 (US2) after its tests are in place.
- After T009, T010 and T011 can run in parallel; T012 can also proceed after T007; T013 follows the server and contract updates.

## Parallel Example: User Story 2

```text
Task: T003 Update departure and empty-team integration coverage in tests/integration/user-stage-sync/group-departure.test.ts
Task: T004 Add the 29,999/30,000 ms timer boundary in tests/integration/user-stage-sync/phase-aware-presence.test.ts
```

## Parallel Example: User Story 1

US1 has no safe intra-story parallel work: complete T001's acceptance tests before implementing T002 in `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`.

## Parallel Example: User Story 3

```text
Task: T010 Populate leader state in server/src/features/user-stage-sync/realtime/websocket-server.ts
Task: T011 Populate leader state in server/src/features/user-stage-sync/application/group-roster-service.ts
```

T012 can run alongside T010 and T011 once T007 has completed; T013 follows all three.

## Implementation Strategy

### MVP increments

1. Implement US1 as the first independently demonstrable increment.
2. Implement US2 to deliver leader succession, online-seat recovery, and empty-team enrollment.
3. Complete US3 before feature release because current leader status must reach teacher and student views.
4. Run focused and full Vitest validation, then compare the implementation with the rendered architecture diagrams.

### Independent acceptance criteria

- **US1**: Both controls remain visible in all specified activity states; the enabled action follows the stage, and both controls are disabled after answering starts.
- **US2**: A leader departs by return or at 30,000 ms of missed heartbeat; an online member takes over during preparation; disconnected sessions do not consume the two online seats; a former leader does not reclaim leadership; the first new joiner to a leaderless empty team becomes leader.
- **US3**: Within five seconds of detection, the teacher roster shows current leader presence and team snapshots show the recipient's updated role; each committed departure increments relevant revisions once.

## Notes

- [P] marks tasks that edit separate files and have no unfinished dependency.
- Story labels map directly to `spec.md`.
- No dependency installation, database migration, or new project structure is planned.

## Phase 7: Convergence

- [X] T016 Apply leader handoff when startup reconciliation classifies legacy `disconnected_until` sessions as offline, preserving atomic role changes, one group/activity revision increment per departure, and post-commit publication when publishers are configured; add coverage for a timed-out leader with an online member in `server/src/features/user-stage-sync/application/student-session-presence-service.ts` and `tests/integration/user-stage-sync/team-session-expiry.test.ts` per FR-004 and SC-002 (partial).
