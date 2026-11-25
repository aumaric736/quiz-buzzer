# Implementation Plan: 全狀態返回角色選擇

**Branch**: `codex/005` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Existing implementation documented from `/specs/005/spec.md`.

## Summary

Provide a global return-to-role control for teacher and student flows. Retire the current session server-side and clear its activity/group context before clearing the browser session id. Preserve activity/group records and isolate other participants. This plan records the implementation already present on `codex/005`.

## Technical Context

**Language/Version**: TypeScript 5.9; Node.js >=22.12  
**Primary Dependencies**: React, Vite, Tailwind CSS; Express 5; better-sqlite3  
**Storage**: SQLite  
**Testing**: Vitest (unit, integration, acceptance)  
**Target Platform**: Browser client with local loopback API  
**Project Type**: TypeScript web application, split into client, server, and shared workspaces  
**Performance Goals**: Local reset completes as one short database transaction; no throughput target for this local simulation.  
**Constraints**: Reset applies to one session only. UI clears the stored id only after successful retirement, or after `SESSION_NOT_FOUND`. Do not delete activities/groups or change other sessions.  
**Scale/Scope**: Shared return control across existing teacher/student flows; one session reset endpoint and retirement guards.

## Constitution Check

| Principle | Assessment | Evidence |
|---|---|---|
| I. Validated Inputs and Clear Errors | Pass | Route validates session id and maps missing/retired sessions to `SESSION_NOT_FOUND`; UI retains state and offers retry on reset errors. |
| II. Secret Handling | Pass | Session id is a local simulation identifier, not an authentication secret; no new credentials/configuration. |
| III. Evidence-Based Testing | Pass | API integration and acceptance coverage includes normal, missing-session, repeat-reset, and reset-failure cases. |
| IV. Attributed Dependencies and Materials | Pass | No new dependency or external material introduced. |
| V. Verifiable Behavior | Pass | Server transaction and Vitest checks verify the state transitions. |
| VI. Clear Structure and Consistent Data | Pass | Shared UI shell, typed client API, service transaction, and retirement guards follow feature boundaries. |
| VII. Subfeature-Based Delivery | Pass | Dedicated `codex/005` branch and `specs/005` documentation. |
| VIII. Design-First with PlantUML | Pass after this documentation pass | Component, class, and sequence diagrams are supplied in `diagrams/005-role-return-*` and rendered as PNG. |

## Project Structure

### Documentation (this feature)

```text
specs/005/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
client/src/features/user-stage-sync/
├── components/ApplicationShell.tsx
├── components/ReturnToRoleControl.tsx
└── services/session-api.ts
server/src/features/user-stage-sync/
├── api/session-routes.ts
├── application/session-service.ts
└── persistence/migrations/005-user-stage-recovery.sql
tests/
├── unit/user-stage-sync/session-service.test.ts
├── integration/user-stage-sync/{sessions-api,activities-api}.test.ts
└── acceptance/user-stage-sync/local-views.test.ts
```

**Structure Decision**: Extend the existing `user-stage-sync` feature module without introducing another workspace. The browser control lives in the shared application shell; API routing delegates retirement to the session service and SQLite persistence layer. Existing API guards reject retired sessions throughout feature routes. See [component diagram](../../diagrams/005-role-return-component.png), [class diagram](../../diagrams/005-role-return-class.png), and [sequence diagram](../../diagrams/005-role-return-sequence.png).

## Delivery Status

Implementation predates this documentation pass. The current branch already contains the session retirement migration/service/API, global return control, retired-session guards, and Vitest coverage. The tasks file records those verified items as complete; the documentation/diagram tasks are completed by this pass. Unavailable-activity recovery remains explicitly deferred.
