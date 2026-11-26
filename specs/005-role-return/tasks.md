# Tasks: 全狀態返回角色選擇

**Input**: Design documents in `/specs/005-role-return/`  
**Status note**: This is a retrospective checklist of work present on `codex/005`, plus the documentation completed in this pass. `[x]` means checked against the current implementation/tests or completed in this documentation pass. There is one explicit deferred item at the end.

## Phase 1: Session retirement and return flow

**Purpose**: Retire a selected role session safely and expose the return action in all supported flows.

- [x] T001 [US1] Add `retired_at` to user sessions in `server/src/features/user-stage-sync/persistence/migrations/005-user-stage-recovery.sql`.
- [x] T002 [US1] Implement transactional, idempotent session retirement and reject retired session restoration in `server/src/features/user-stage-sync/application/session-service.ts`.
- [x] T003 [US1] Expose `POST /api/sessions/:sessionId/reset-context` in `server/src/features/user-stage-sync/api/session-routes.ts`.
- [x] T004 [US1] Reject retired sessions across activity, group, answer/review, guided-notes and websocket operations in `server/src/features/user-stage-sync/`.
- [x] T005 [US1] Reset server context before clearing local session id, accepting `SESSION_NOT_FOUND` as already absent in `client/src/features/user-stage-sync/services/session-api.ts`.
- [x] T006 [US1] Render return-to-role control from the shared shell and preserve flow/id on retryable errors in `client/src/features/user-stage-sync/components/ApplicationShell.tsx` and `ReturnToRoleControl.tsx`.

## Phase 2: Acceptance evidence

**Purpose**: Verify reset lifecycle, data preservation/isolation, errors, and UI coverage.

- [x] T007 [US1] Cover student reset, cleared context, retained group, blocked retired-session use, idempotency, missing session, and fresh-session reset in `tests/integration/user-stage-sync/sessions-api.test.ts`.
- [x] T008 [US2] Cover teacher reset isolation from activity phase/revision and student session in `tests/integration/user-stage-sync/activities-api.test.ts`.
- [x] T009 [US1] Cover reset ordering, transient failure retention/retry, missing-session handling, and shared-shell visibility across flow states in `tests/acceptance/user-stage-sync/local-views.test.ts`.
- [x] T010 [US1] Cover retirement service behavior in `tests/unit/user-stage-sync/session-service.test.ts`.

## Phase 3: Design and feature documentation

**Purpose**: Document the actual branch behavior and preserve design traceability.

- [x] T011 [US1] Document current behavior, boundaries, acceptance criteria, and deferred unavailable-activity recovery in `specs/005-role-return/spec.md`.
- [x] T012 [US1] Record architecture, research decisions, session model, API/UI contracts, and local verification walkthrough in `specs/005-role-return/plan.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.
- [x] T013 [US1] Add component, class, and sequence diagrams with rendered PNGs in `diagrams/005-role-return-*.puml` and `diagrams/005-role-return-*.png`.
- [x] T014 [US1] Record specification quality review in `specs/005-role-return/checklists/requirements.md`.
- [x] T015 [US1] Run cross-artifact converge/analyze and record validation results in `specs/005-role-return/implementation-report.md`.

## Deferred work

- [ ] T016 (origin: `user-stage-sync` T042) Define and implement unavailable-activity recovery controls and acceptance tests in a later subfeature. This is the explicitly deferred former FR-014 and is not part of `codex/005`.

## Dependencies

- T001 precedes T002; T002 precedes T003 and T004.
- T005/T006 depend on the reset API contract (T003).
- T007–T010 validate the implementation; T011–T015 document and review it.
- T016 is intentionally outside this feature's implementation scope.
