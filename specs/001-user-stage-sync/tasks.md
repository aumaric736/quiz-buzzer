---
description: "Dependency-ordered implementation tasks for user roles and activity-stage synchronization"
---

# Tasks: 使用者角色與活動階段同步

**Input**: Design documents from `specs/001-user-stage-sync/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [API contracts](contracts/api-contracts.md), [UI contracts](contracts/ui-contracts.md), [quickstart.md](quickstart.md)

**Tests**: Required by the project constitution. Each core story has Vitest tests for normal and boundary behavior; tests are written before story implementation.

**Organization**: Tasks are grouped by the four prioritized user stories. Google Sheets is deferred and has no tasks in this feature.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the TypeScript npm workspaces and configure the requested client, server, and test toolchain.

- [X] T001 Create npm workspaces and lockfile in `package.json`, `client/package.json`, `server/package.json`, `shared/package.json`, and `package-lock.json`; set Node engine `>=22.12`, shared dependencies, and server dev command `node --env-file=../.env --import tsx --watch src/app.ts`.
- [X] T002 [P] Configure strict TypeScript and workspace references in `tsconfig.json`, `client/tsconfig.json`, `server/tsconfig.json`, and `shared/tsconfig.json`.
- [X] T003 [P] Configure React/Vite/Tailwind client entry and scripts in `client/vite.config.ts`, `client/index.html`, `client/src/main.tsx`, and `client/src/styles.css`; bind Vite to `127.0.0.1` and set Vite `envDir` to the repository root without exposing non-`VITE_` variables.
- [X] T004 [P] Create the Express and WebSocket service entry in `server/src/app.ts`; bind only to `127.0.0.1` and read `HOST`, `PORT`, `CLIENT_ORIGIN`, and `DATABASE_PATH` from validated configuration.
- [X] T005 [P] Configure root Vitest execution in `vitest.config.ts` and root `package.json` so `npm test` runs `vitest run` across unit and integration tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared types, persistent schema, session selection, validation, errors, and safe logging before story work begins.

**Checkpoint**: All following user stories depend on the local service, database, shared contracts, and simulated role session.

- [X] T006 [P] Validate `HOST=127.0.0.1`, integer `PORT` in range 1–65535, `CLIENT_ORIGIN`, and `DATABASE_PATH` in `server/src/config/env.ts`; reject non-loopback hosts and invalid/missing values with clear errors, and align names with root `.env.example`.
- [X] T007 [P] Implement allowlisted structured logging in `server/src/logging/logger.ts`; never log credentials, authorization headers, private keys, environment contents, raw request bodies, or unsanitized external-service errors.
- [X] T008 [P] Implement request validation and sanitized error responses in `server/src/api/validation.ts` and `server/src/api/error-middleware.ts`; use the API contract `{ code, message }` and do not return stack traces or sensitive values.
- [X] T009 [P] Define shared `Role`, `ActivityPhase`, session, activity, group, API-error, and WebSocket event types in `shared/src/user-stage-sync/contracts.ts`; allowed roles are exactly `teacher` and `student`, and allowed phases are exactly `準備中`, `搶答進行中`, and `已結束`.
- [X] T010 [P] Create SQLite migration `server/src/features/user-stage-sync/persistence/migrations/001-user-stage-sync.sql` with `user_sessions(id, role, activity_id, group_id, updated_at)`, `activities(id, phase, revision, created_by_session_id, created_at, updated_at)`, and `groups(id, activity_id, display_name, normalized_name, joined_at)`; constrain role to exactly `teacher` or `student`, phase to exactly `準備中`, `搶答進行中`, or `已結束`, revision to `>= 0`, group `display_name` to a non-empty trimmed name, `normalized_name` to trimmed English-case-folded form, and `(activity_id, normalized_name)` to unique; add foreign keys.
- [X] T011 Initialize `better-sqlite3`, enable foreign-key checks, apply migrations, and expose short transaction helpers in `server/src/features/user-stage-sync/persistence/database.ts`.
- [X] T012 Create Vitest setup and a temporary migrated SQLite database helper in `tests/setup/vitest.setup.ts` and `tests/helpers/sqlite.ts`; ensure each test run is isolated from `data/quiz-buzzer.sqlite`.
- [X] T013 Write Vitest session tests in `tests/unit/user-stage-sync/session-service.test.ts` and `tests/integration/user-stage-sync/sessions-api.test.ts`; cover normal teacher/student session creation and boundary rejection of missing or unknown roles.
- [X] T014 Implement simulated session creation and role validation in `server/src/features/user-stage-sync/application/session-service.ts` and `server/src/features/user-stage-sync/api/session-routes.ts`; persist `id`, `role`, nullable `activityId`, optional `groupId`, and `updatedAt`, with student group context required only after enrollment.
- [X] T015 Implement role selection and persist only the non-secret local `sessionId` in `client/src/features/user-stage-sync/components/RoleSelector.tsx` and `client/src/features/user-stage-sync/services/session-api.ts`; do not present role selection as account authentication.

---

## Phase 3: User Story 1 - 老師建立並切換活動階段 (Priority: P1) 🎯 MVP

**Goal**: A teacher creates an activity in `準備中` and advances it only through the allowed forward phases.

**Independent Test**: Create an activity as teacher, verify initial `準備中`, transition to `搶答進行中` then `已結束`, and verify skip, reverse, and reopen attempts are rejected without changing SQLite state.

### Tests for User Story 1

- [X] T016 [US1] Write failing Vitest activity lifecycle tests in `tests/unit/user-stage-sync/activity-service.test.ts` and `tests/integration/user-stage-sync/activities-api.test.ts`; cover create/default phase and both valid transitions as normal cases, assert creation saves `activityId` on the teacher session, and cover wrong-role, skipped, backward, blank, unknown, and terminal-state transitions as boundary cases.

### Implementation for User Story 1

- [X] T017 [P] [US1] Implement SQLite activity create/read/update operations in `server/src/features/user-stage-sync/persistence/activity-repository.ts`; persist `id`, `phase`, non-negative `revision`, `createdBySessionId`, `createdAt`, and `updatedAt`.
- [X] T018 [P] [US1] Implement typed activity HTTP calls and sanitized error mapping in `client/src/features/user-stage-sync/services/activity-api.ts` for `POST /api/activities`, `GET /api/activities/{activityId}`, and `POST /api/activities/{activityId}/phase`.
- [X] T019 [US1] Implement teacher-only creation and transitions in `server/src/features/user-stage-sync/application/activity-service.ts` and `server/src/features/user-stage-sync/persistence/activity-repository.ts`; atomically create the activity and update the teacher session `activityId`, initialize phase to `準備中` and revision to `0`, and allow only `準備中 → 搶答進行中 → 已結束` with `已結束` terminal.
- [X] T020 [US1] Implement activity create/read/phase routes in `server/src/features/user-stage-sync/api/activity-routes.ts`; return the shared response fields `activityId`, `phase`, and `revision`, and return `409 INVALID_PHASE_TRANSITION` without changing state for invalid transitions.
- [X] T021 [US1] Implement the teacher activity view in `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`; show current phase, create an activity, expose only the valid next phase action, and display clear API errors.

**Checkpoint**: US1 works independently; a teacher can create and advance a persisted activity without any student or Sheets integration.

---

## Phase 4: User Story 2 - 學生以組別加入活動 (Priority: P1)

**Goal**: A student joins an activity during preparation using a valid, activity-unique group name.

**Independent Test**: Enroll a valid group during preparation, then verify blank, duplicate normalized, and post-start/post-end enrollments are rejected and do not add SQLite rows.

### Tests for User Story 2

- [X] T022 [US2] Write failing Vitest group enrollment tests in `tests/unit/user-stage-sync/group-service.test.ts` and `tests/integration/user-stage-sync/groups-api.test.ts`; cover valid enrollment saving student session `activityId`/`groupId`, rejected enrollment leaving session context unchanged, and blank names, duplicate case/whitespace variants, wrong role, concurrent duplicate requests, and enrollment during `搶答進行中` or `已結束` as boundary cases.

### Implementation for User Story 2

- [X] T023 [P] [US2] Implement group insert and lookup in `server/src/features/user-stage-sync/persistence/group-repository.ts`; store `id`, `activityId`, trimmed `displayName`, English-case-folded trimmed `normalizedName`, and `joinedAt`, relying on SQLite `UNIQUE(activity_id, normalized_name)`.
- [X] T024 [P] [US2] Implement typed group enrollment calls and error mapping in `client/src/features/user-stage-sync/services/group-api.ts` for `POST /api/activities/{activityId}/groups`.
- [X] T025 [US2] Implement group validation and enrollment in `server/src/features/user-stage-sync/application/group-service.ts` and `server/src/features/user-stage-sync/persistence/group-repository.ts`; reject empty trimmed names, compare names after trimming and English case-folding, allow enrollment only during `準備中`, and atomically perform phase check, group insert, and student session `activityId`/`groupId` update.
- [X] T026 [US2] Implement group enrollment route in `server/src/features/user-stage-sync/api/group-routes.ts`; return `400 INVALID_GROUP_NAME`, `409 GROUP_NAME_TAKEN`, and `409 ENROLLMENT_CLOSED` as defined in `contracts/api-contracts.md`.
- [X] T027 [US2] Implement the student join view in `client/src/features/user-stage-sync/views/StudentJoinView.tsx`; validate non-empty group input, display the activity phase, and show clear duplicate/closed-enrollment errors.

**Checkpoint**: US1 and US2 work together; only unique groups can join before the teacher starts the activity.

---

## Phase 5: User Story 3 - 階段即時同步並隱藏作答狀況 (Priority: P1)

**Goal**: All connected local views receive committed phase updates, and students cannot read other groups' answer status before the activity ends.

**Independent Test**: Connect teacher and student views to one activity, verify phase updates arrive within 1 second, deny answer-status reads before `已結束` without returning data, and permit the post-end view.

### Tests for User Story 3

- [X] T028 [US3] Write failing Vitest WebSocket and access-control tests in `tests/integration/user-stage-sync/realtime-and-answer-visibility.test.ts` and `tests/integration/user-stage-sync/answer-attempt-check.test.ts`; cover normal broadcast to all activity subscribers, live-phase answer permission without answer data, and post-end status read; cover boundary phase-not-committed/no-broadcast, stale revision, malformed message, pre-end 403 with no answer data, and preparation/ended answer-check rejection.

### Implementation for User Story 3

- [X] T029 [P] [US3] Implement validated WebSocket subscriptions and activity-scoped client tracking in `server/src/features/user-stage-sync/realtime/websocket-server.ts`; accept only `activity.subscribe` messages with an existing activity and session.
- [X] T030 [P] [US3] Implement the browser WebSocket client in `client/src/features/user-stage-sync/services/activity-socket.ts`; validate `activity.phase.updated` payloads and ignore events whose revision is less than or equal to the displayed revision.
- [X] T031 [P] [US3] Implement answer-status access checks in `server/src/features/user-stage-sync/application/answer-status-access.ts` and `server/src/features/user-stage-sync/api/answer-status-routes.ts`, plus the answer phase guard in `server/src/features/user-stage-sync/application/answer-phase-guard.ts` and `server/src/features/user-stage-sync/api/answer-attempt-check-routes.ts`; hide status before `已結束`, allow status reads afterward, allow the answer flow only during `搶答進行中`, return phase-specific errors otherwise, and never accept or store answer content.
- [X] T032 [US3] Publish `activity.phase.updated` from `server/src/features/user-stage-sync/application/activity-service.ts` only after the SQLite phase/revision transaction commits; include `activityId`, `phase`, and `revision` and do not broadcast failed transitions.
- [X] T033 [US3] Connect teacher/student phase views in `client/src/features/user-stage-sync/components/ActivityPhaseStatus.tsx`, `client/src/features/user-stage-sync/services/answer-access-api.ts`, `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`, and `client/src/features/user-stage-sync/views/StudentJoinView.tsx`; show the same phase on subscribed local views, show phase-specific answer-attempt-check results without submitting or storing answer content, and only show answer status after `已結束`.

**Checkpoint**: US1–US3 work together; SQLite remains authoritative while WebSocket provides timely local updates and server access checks enforce answer-status visibility.

---

## Phase 6: User Story 4 - 恢復中斷後的活動階段 (Priority: P2)

**Goal**: Refresh and reconnect restore the simulated role/activity context and the latest saved phase.

**Independent Test**: Refresh teacher and student views after a phase change; verify the same session/activity and current phase return within 3 seconds, while missing sessions/activities show a clear recovery error.

### Tests for User Story 4

- [X] T034 [US4] Write failing Vitest refresh/reconnect tests in `tests/integration/user-stage-sync/session-restore.test.ts` and `tests/acceptance/user-stage-sync/local-views.test.ts`; cover normal session/activity/group/phase restoration after create and join within 3 seconds and boundary missing-session/activity handling, disconnect recovery, and stale event rejection.

### Implementation for User Story 4

- [X] T035 [P] [US4] Implement `GET /api/sessions/{sessionId}` in `server/src/features/user-stage-sync/api/session-routes.ts`; return saved `role`, `activityId`, and `groupId`, and return a clear `404 SESSION_NOT_FOUND` if the local context no longer exists.
- [X] T036 [P] [US4] Implement client startup restoration in `client/src/features/user-stage-sync/services/session-restore.ts`; read the non-secret local session id, fetch the current session and activity snapshot, and never write a cached phase over the API response.
- [X] T037 [US4] Add reconnect recovery in `client/src/features/user-stage-sync/services/activity-socket.ts`; after reconnection, fetch the latest activity snapshot, resubscribe, ignore stale revisions, and surface an actionable recovery message if the activity is missing.

**Checkpoint**: US1–US4 work together; refreshing or reconnecting cannot roll a view back to an older activity phase.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Close attribution, secret/logging, quickstart, and diagram-alignment requirements across all stories.

- [X] T038 [P] Create `THIRD_PARTY_NOTICES.md` listing each direct package's source and license, including React, Vite, Tailwind CSS, Express, `better-sqlite3`, `ws`, Vitest, TypeScript, and `tsx`.
- [X] T039 [P] Add security/configuration regression checks in `tests/integration/user-stage-sync/security-and-config.test.ts`; verify non-loopback binding is rejected, `.env` is ignored while `.env.example` is not, and logger output omits credential-like values and raw environment/request data.
- [X] T040 Run the test command and acceptance steps in `specs/001-user-stage-sync/quickstart.md`; record exact Vitest command, results, measured 30-second activity-creation time, 1-second phase sync, and 3-second recovery outcomes in the implementation report.
- [X] T041 Treat `diagrams/001-user-stage-sync-component.puml`, `diagrams/001-user-stage-sync-class.puml`, and `diagrams/001-user-stage-sync-sequence.puml` as architecture inputs before implementation, then compare final activity/client/server flows against them; update for approved divergence and regenerate all three PNGs in `diagrams/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 creates workspace manifests, then T002–T005 can proceed in parallel.
- **Foundational (Phase 2)**: Depends on Setup; role sessions, validation, error handling, shared types, and SQLite block all user stories.
- **US1 (Phase 3)**: Depends on Foundational; no dependency on other stories. This is the MVP increment.
- **US2 (Phase 4)**: Depends on US1 because group enrollment needs a persisted activity and phase.
- **US3 (Phase 5)**: Depends on US1 and US2 for complete teacher/student activity flows and group-scoped visibility.
- **US4 (Phase 6)**: Depends on session foundation and US1/US3 API and synchronization contracts.
- **Polish (Phase 7)**: Depends on all desired stories being complete.

### User Story Completion Order

1. US1 (P1) — teacher activity lifecycle; independent after Foundational.
2. US2 (P1) — group enrollment; depends on US1 activity creation.
3. US3 (P1) — phase broadcast and answer-status visibility; depends on US1 and US2.
4. US4 (P2) — refresh/reconnect restoration; depends on persisted sessions and phase synchronization.

### Parallel Opportunities

- After T001, T002, T003, T004, and T005 touch separate configuration files and can run in parallel.
- In US1, after T016, T017 (SQLite repository) and T018 (client HTTP service) touch separate files and can run in parallel.
- In US2, after T022, T023 (group repository) and T024 (client group API) touch separate files and can run in parallel.
- In US3, after T028, T029 (server WebSocket), T030 (client WebSocket), and T031 (answer access gate) touch separate files and can run in parallel.
- In US4, after T034, T035 (server session lookup) and T036 (client restore flow) touch separate files and can run in parallel.

## Parallel Execution Examples

### User Story 1

```text
After T016: Task T017 — activity repository in server/src/features/user-stage-sync/persistence/activity-repository.ts
After T016: Task T018 — client activity API in client/src/features/user-stage-sync/services/activity-api.ts
```

### User Story 2

```text
After T022: Task T023 — group repository in server/src/features/user-stage-sync/persistence/group-repository.ts
After T022: Task T024 — group API client in client/src/features/user-stage-sync/services/group-api.ts
```

### User Story 3

```text
After T028: Task T029 — server WebSocket in server/src/features/user-stage-sync/realtime/websocket-server.ts
After T028: Task T030 — browser WebSocket client in client/src/features/user-stage-sync/services/activity-socket.ts
After T028: Task T031 — answer-status access gate in server/src/features/user-stage-sync/application/answer-status-access.ts
```

### User Story 4

```text
After T034: Task T035 — session lookup API in server/src/features/user-stage-sync/api/session-routes.ts
After T034: Task T036 — client restoration in client/src/features/user-stage-sync/services/session-restore.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Complete US1 and run its Vitest unit/API tests.
3. Demonstrate teacher activity creation and ordered phase transitions backed by SQLite.
4. Stop for independent review before adding group enrollment.

### Incremental Delivery

1. Add US2 group enrollment and duplicate/closed-phase checks.
2. Add US3 WebSocket updates and answer-status access control.
3. Add US4 refresh/reconnect restoration.
4. Complete security, attribution, quickstart, and PlantUML/code-alignment checks.

## Format and Scope Notes

- Every implementation task uses `- [ ] T###`, includes `[P]` only when parallelizable, includes `[US#]` on story tasks, and names at least one concrete file path.
- Tests are required by the constitution and cover normal plus boundary behavior in every core story.
- Google Sheets and its environment variables are deliberately excluded from this feature; create a separate subfeature after defining the sheet data contract.

## Phase 8: Convergence

- [ ] T042 Add an actionable missing-activity recovery control in `client/src/features/user-stage-sync/components/ActivityPhaseStatus.tsx` and `client/src/main.tsx` that clears stale local session context and returns to role/activity selection; cover the reconnect boundary in `tests/acceptance/user-stage-sync/local-views.test.ts` per spec edge case: missing activity (partial).
