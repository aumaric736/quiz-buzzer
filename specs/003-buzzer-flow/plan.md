# Implementation Plan: 課堂搶答流程

**Branch**: `codex/003-buzzer-flow` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-buzzer-flow/spec.md`

## Summary

Extend the existing activity lifecycle with a persisted, role-aware buzzer flow. A teacher starts and ends the activity; joined student groups submit one ordered answer per blank for an imported Guided Notes question. The first valid submission committed by SQLite becomes the question winner. Teacher status updates are published after commit, students receive only their own acknowledgement while live, and joined students can read complete results after end. Implement the existing `WinningAnswerProvider` contract from durable SQLite records for Guided Notes export.

The three diagrams in `./diagrams/003-buzzer-flow-{component,class,sequence}.puml` are the architecture blueprint. Their responsibilities map to the existing React views and activity lifecycle, a new buzzer-flow application/repository layer, the shared provider contract, a `buzzer_submissions` store, and role-scoped realtime publication.

## Technical Context

**Language/Version**: TypeScript, Node.js `>=22.12` (repository engine requirement)

**Primary Dependencies**: React, Vite, Tailwind CSS, Express 5, `better-sqlite3`, `ws`, Vitest; reuse installed workspace dependencies, add no package.

**Storage**: Existing SQLite `activities`, `user_sessions`, `groups`, `activity_questions`, and `guided_notes_blank_mappings`; add one migration for accepted submissions.

**Testing**: Vitest unit, integration, and acceptance tests; tests cover success and boundary cases, including transaction races, role visibility, reload/reconnect, and provider completeness.

**Target Platform**: Local single-machine browser and Node.js service. No network-accessible classroom server is in scope.

**Project Type**: Existing three-workspace web application (`client`, `server`, `shared`).

**Performance Goals**: A committed answer should update connected teacher views within 1 second. Concurrent same-question submissions must produce exactly one winner. No new scale target beyond a local classroom simulation.

**Constraints**: Use the imported Guided Notes question numbers and blank counts; freeze questions/mappings once an activity starts; keep the buzzer active until the teacher manually ends it (no countdown or automatic timeout); serialize answer acceptance with end transition using one synchronous SQLite write transaction; do not trust client timestamps; publish answer events only after commit; never expose answer payloads in logs or live student responses. This feature does not access Google Sheets or add credentials; Guided Notes owns Sheets I/O and injects the existing provider contract.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan assessment |
|---|---|
| I. Validated Inputs and Clear Errors | Pass: validate session role, activity ownership/membership, phase, question, number of answer parts, and trimmed non-empty parts at API and transaction boundaries; return stable codes and actionable Traditional Chinese messages. |
| II. Secret Handling | Pass: no new credentials; retain the existing `.env.example` and `.gitignore` handling. Do not log answer parts, request bodies, credentials, or provider results. |
| III. Evidence-Based Testing | Pass: specify Vitest normal and boundary coverage for core flows; implementation completion must report commands and actual results. |
| IV. Attributed Dependencies and Materials | Pass: reuse already recorded dependencies and licenses; add no package or imported material. |
| V. Verifiable Behavior | Pass: server-side authorization, SQLite uniqueness/transactions, REST reads, and WebSocket filtering implement behavior; no mock-only behavior. |
| VI. Clear Structure and Consistent Data | Pass: separate shared contracts, feature application/persistence, transport, and UI; SQLite is authoritative and all reads derive from it. |
| VII. Subfeature-Based Delivery | Pass: feature remains on `codex/003-buzzer-flow`, with its own spec, plan, tasks, and tests. |
| VIII. Design-First with PlantUML | Pass: use all three required diagrams as primary blueprints; retain `.puml` and colocated PNG outputs and check code against them during implementation. |

**Post-design re-check**: All principles remain satisfied; no exception or added dependency is required.

## Phase 0: Research Decisions

Detailed findings and alternatives are recorded in [research.md](research.md). Key decisions:

1. Reuse `ActivityPhase`, teacher ownership, group membership, and the Guided Notes `activity_questions` list; prohibit source/question replacement once the phase leaves preparation.
2. Validate and insert an accepted winner in one short synchronous immediate SQLite transaction. A database unique constraint on `(activity_id, question_number)` is the final concurrency guard. The first committed valid submission wins; no client clock is consulted.
3. Implement the existing `WinningAnswerProvider` from persisted submissions after the activity ends, returning one result for every imported question, including explicit `winner: false` entries.
4. Enforce visibility on REST and WebSocket boundaries: live teacher reads/events include answer status; live student reads expose only their own accepted submission; final results are visible to joined students after end. Reload/reconnect reads an authorized database snapshot.
5. Keep Google API access in Guided Notes. This feature neither reads Sheets nor introduces service-account credentials; routine logs exclude answer data.
6. Reuse the current workspace stack and package set.

## Phase 1: Design and Contracts

### Blueprint Responsibilities

- **Teacher activity view**: open/end controls and a live per-question result/status view.
- **Student answer view**: render imported question numbers and one input per imported blank; show only own acknowledgement while live and complete results after end.
- **Buzzer flow service**: validate the request/actor, coordinate phase and question checks, call the persistence transaction, then publish committed events.
- **Validator / adjudicator**: enforce phase, membership, question and answer shape; the database commit/unique key defines first-winner order.
- **Submission/result store**: persist one accepted winning submission per question and support role-filtered result queries.
- **Role-scoped live updates**: continue public phase events, send answer events to the activity teacher, and never send live winner data to student sockets.
- **Winning answer provider**: adapt persisted results to `@quiz-buzzer/shared` Guided Notes contract after end.

### API Contracts

Detailed transport shapes are in [contracts/http-and-realtime.md](contracts/http-and-realtime.md).

- Reuse `POST /api/activities/:activityId/phase` for the existing teacher-owned ordered lifecycle. Transition to `搶答進行中` requires a non-empty, consistent imported question/blank mapping set. Transition to `已結束` serializes with submissions.
- Reuse `GET /api/activities/:activityId` and the existing activity subscription for phase snapshot/reconnect. Keep phase event payloads answer-free.
- `GET /api/activities/:activityId/questions` returns the imported question numbers and blank counts for the student form.
- `POST /api/activities/:activityId/answers` accepts a question number and ordered `answerParts`; the session header identifies the already-joined group. The service accepts only the exact blank count of non-empty strings and gives no competing-group information in rejection messages.
- Extend `GET /api/activities/:activityId/answer-status`: teacher reads all question statuses while live; a joined student reads only their own accepted status while live; both roles can read the full result after end.
- WebSocket `buzzer.question.updated` events contain committed winner/status data for the teacher subscription only. Student receives no answer event while live. After the phase ends clients fetch the authorized final snapshot; reconnect always re-reads from SQLite.
- Expose the existing `WinningAnswerProvider.getResults(activityId)` to the Guided Notes export flow only after end.

### Persistence Design

See [data-model.md](data-model.md). Add `003-buzzer-flow.sql` alongside the existing user-stage-sync migrations. `buzzer_submissions` stores the accepted group's id, question number, ordered JSON answer parts, database order, and server timestamp. Foreign keys associate the row with the activity question and activity group; `UNIQUE(activity_id, question_number)` permits at most one winner. There is no durable record for rejected submissions.

All phase/membership/question/blank-count/nonblank/duplicate/winner checks and the insert occur inside a synchronous immediate write transaction. Refactor phase transition so its current-phase validation and update also occur inside one immediate transaction; this closes the current read-before-transaction window. SQLite serializes the two writer transactions, so whichever commits first defines whether an answer is included. Commit before any socket send. Existing Guided Notes import/save code must reject changes to its question list or blank mappings outside `準備中`.

### Source Layout

```text
shared/src/
├── buzzer-flow/contracts.ts                 # request/status/realtime types
├── buzzer-flow/index.ts
└── index.ts                                 # export buzzer contracts

server/src/features/
├── buzzer-flow/
│   ├── api/buzzer-flow-routes.ts            # question list and submit endpoints
│   ├── application/buzzer-flow-service.ts   # validation and flow coordination
│   ├── application/winning-answer-provider.ts
│   └── persistence/buzzer-flow-repository.ts
├── user-stage-sync/
│   ├── api/activity-routes.ts               # start/end prerequisite
│   ├── api/answer-status-routes.ts          # role-specific status reads
│   ├── application/activity-service.ts      # imported-question start guard
│   ├── application/answer-status-access.ts  # live/final projections
│   ├── persistence/migrations/003-buzzer-flow.sql
│   └── realtime/websocket-server.ts         # role-filtered event publisher
└── app.ts                                    # route, publisher, provider composition

client/src/features/
├── buzzer-flow/
│   ├── services/buzzer-flow-api.ts
│   ├── components/AnswerQuestionForm.tsx
│   ├── components/QuestionResultList.tsx
│   └── views/StudentAnswerView.tsx
└── user-stage-sync/
    ├── views/TeacherActivityView.tsx          # controls and teacher live results
    └── services/activity-socket.ts           # typed phase and buzzer messages

tests/
├── unit/buzzer-flow/                         # validators, adjudication, provider
├── integration/buzzer-flow/                  # migrations, APIs, transactions, privacy
└── acceptance/buzzer-flow/                   # teacher/student user flows
```

**Structure Decision**: Extend the existing `client`, `server`, and `shared` workspaces. Keep answer logic inside its own server feature module, while touching existing activity phase, status, Guided Notes import freeze, app composition, and WebSocket integration points. No alternate project layout or new service is introduced.

### Implementation and Validation Order

1. Add shared contracts and migration; verify schema/constraints and transaction repository behavior.
2. Implement service, winner provider, phase-start validation, and import freeze; add unit/integration tests. Do not move to API/UI until this phase’s focused tests pass.
3. Add validated endpoints, role-filtered status projection, and WebSocket publishing; test owner/member checks and payload privacy, including concurrent submission and end races. Do not move to UI until this phase’s focused tests pass.
4. Add student and teacher React flows with reconnect/reload snapshot behavior; add acceptance coverage. Do not move to final validation until this phase’s focused tests pass.
5. Run feature tests, full `npm.cmd test`, and `npm.cmd run build`; compare final code and contracts against all three PlantUML diagrams and update diagrams if actual architecture differs.

## Quickstart

See [quickstart.md](quickstart.md) for local Windows commands and manual scenarios. Use `npm.cmd` from PowerShell because the repository uses npm's PowerShell shim, and open separate terminals for the server and Vite client. Continue to use the existing `.env` copied from `.env.example` only when Guided Notes Sheets access is needed; this feature adds no new secret variables.

## Complexity Tracking

No constitution violations or exceptions. The new repository/provider and role-aware event path are required by the diagrams, durability, and privacy boundary; no simpler frontend-only or transient-state alternative meets those requirements.
