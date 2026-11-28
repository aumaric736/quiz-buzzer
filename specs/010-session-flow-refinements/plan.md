# Implementation Plan: Session Flow Refinements

**Branch**: `codex/010` | **Date**: 2026-11-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-session-flow-refinements/spec.md`

## Summary

Keep 「開始加入」 and 「開始答題」 side by side in every activity state, enabling only the action valid for the current state: before joining opens, joining is enabled; after joining opens, answering is enabled; after answering starts, both are disabled. During team formation, when a leader leaves explicitly or is marked offline after 30 seconds without a heartbeat, promote the remaining online member; keep online capacity to two, clear leader assignment when there is no successor, and let the first later joiner to a leaderless empty team become leader. Publish committed role and presence changes through existing live events. Use the current TypeScript workspaces, React/Vite/Tailwind UI, SQLite-backed server, WebSocket publisher, and Vitest suite without adding dependencies or schema migrations.

## Technical Context

**Language/Version**: TypeScript 5.9; Node.js >=22.12; React 19

**Primary Dependencies**: React 19, Vite 6, Tailwind CSS 4, Express, `ws`, `better-sqlite3`; existing workspace dependencies only

**Storage**: Existing SQLite tables `activities`, `groups`, and `user_sessions`; no new persistent fields expected

**Testing**: Vitest 5.1.1; unit, integration, and acceptance suites under `tests/`

**Target Platform**: Browser client with the local Node.js server

**Project Type**: TypeScript monorepo web application with `client/`, `server/`, and `shared/` workspaces

**Performance Goals**: After an offline transition is detected, publish updated state so connected teacher and team member views reflect it within 5 seconds. Keep the current 10-second WebSocket ping cadence and classify a session offline when 30 seconds have elapsed without a heartbeat (29,999 ms online; 30,000 ms offline).

**Constraints**: Preserve current activity phase rules, teacher ownership checks, capacity of two online student seats, live revision ordering, validation/error conventions, and session restore behavior. Disconnected, non-retired sessions remain associated for recovery but do not consume online seats; if both seats are filled on return, require reassignment. Promote only during `準備中`; do not let a returning former leader reclaim leadership automatically. Clear the current leader pointer when no successor is online, and promote the first new joiner to a leaderless empty team. Keep `groups.accepts_members` enabled after a leader departure while the activity remains joinable. Increment each affected live revision once per committed departure transition.

**Scale/Scope**: Existing limit of 100 groups per activity and 2 online student seats per group; disconnected sessions may remain linked for recovery without consuming an online seat. Update teacher controls, group/presence transitions, shared live-event shapes, and focused Vitest coverage.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Plan alignment |
|---|---|---|
| Validated inputs and clear errors | PASS | Reuse current validated teacher phase and enrollment routes; preserve domain errors for invalid state and capacity. |
| Secret handling | PASS | No new credentials, integrations, or configuration values. |
| Evidence-based testing | PASS | Plan includes normal and boundary Vitest coverage for phase controls, departure, timeout, capacity, and event propagation. Tests are specified but not run during planning. |
| Attributed dependencies | PASS | No new external packages or imported materials. |
| Verifiable behavior | PASS | Define observable state and acceptance scenarios through existing UI and HTTP/WebSocket flows. |
| Clear structure and consistent data | PASS | Keep role handoff, empty-team leader assignment, revisions, online capacity, and presence counts transactionally consistent; use existing feature boundaries. |
| Subfeature-based delivery | PASS | Work remains in `codex/010` and `specs/010-session-flow-refinements`. |
| Design-first with PlantUML | PASS | Component, class, and sequence diagrams are present under `diagrams/` and rendered to PNG; use them as design references. |

No gate violations identified.

## Project Structure

### Documentation (this feature)

```text
specs/010-session-flow-refinements/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── activity-controls.md
    └── live-presence-events.md
```

### Source Code (repository root)

```text
client/src/features/user-stage-sync/
├── views/TeacherActivityView.tsx
├── components/TeacherGroupRoster.tsx
├── services/activity-socket.ts
└── services/live-activity-state.ts

server/src/features/user-stage-sync/
├── application/activity-service.ts
├── application/group-service.ts
├── application/session-service.ts
├── application/student-session-presence-service.ts
├── api/session-routes.ts
├── api/group-routes.ts
├── persistence/group-repository.ts
└── realtime/websocket-server.ts

server/src/app.ts

shared/src/user-stage-sync/contracts.ts

tests/
├── unit/user-stage-sync/
├── integration/user-stage-sync/
└── acceptance/user-stage-sync/
```

**Structure Decision**: Extend the existing user-stage-sync feature slices across the client, server, and shared workspace. Add behavior to current services and live contracts; do not create a new project or parallel feature module.

### Design References

The component, class, and sequence diagrams are the primary architecture blueprints for this plan:

- [Component diagram](../../diagrams/010-session-flow-refinements-component.puml) and [rendered view](../../diagrams/010-session-flow-refinements-component.png)
- [Class diagram](../../diagrams/010-session-flow-refinements-class.puml) and [rendered view](../../diagrams/010-session-flow-refinements-class.png)
- [Sequence diagram](../../diagrams/010-session-flow-refinements-sequence.puml) and [rendered view](../../diagrams/010-session-flow-refinements-sequence.png)

### Post-Design Constitution Check

All gates remain **PASS** after design. No schema migration or dependency is introduced; handoffs and revisions remain transactional; the documented Vitest scenarios cover normal and boundary behavior; and all three required `.puml` diagrams have corresponding PNG renders.

## Complexity Tracking

No constitution exceptions or additional projects are required.
