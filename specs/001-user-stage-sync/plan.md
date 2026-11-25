# Implementation Plan: 使用者角色與活動階段同步

**Branch**: `codex/005` | **Date**: 2026-11-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-user-stage-sync/spec.md`; stack and security constraints supplied during planning.

## Summary

Implement the role and activity lifecycle as a local TypeScript application.
React/Vite/Tailwind provide the teacher and student views; a Node.js/Express
service bound to loopback owns activity operations and SQLite state; WebSocket
events notify connected local views after committed phase changes. Refresh and
reconnect reload the authoritative state from the service. The service is not
reachable from other devices. Google Sheets is explicitly deferred to a later
subfeature because this feature has no sheet data contract; when added, that
subfeature must use Google's official API from the server side.

The component, class, and sequence diagrams in `./diagrams/` remain the primary
architecture blueprints. Any user who has selected a role can return to role
selection from every subsequent teacher or student flow. The client asks the
local service to retire the old session and clear its activity and group
references, then removes its saved session id. Activity and group rows remain
stored, so the group's name remains reserved. A new role choice creates a new
active session. FR-014 specifies an unavailable-activity recovery message and
the same return control for future work; this behavior is deferred outside
`codex/005`, which does not implement unavailable-activity state or recovery.
If a teacher returns while students are using an activity, only the teacher's session is retired;
the phase and student sessions remain unchanged, with no automatic ending or
control handoff.

## Technical Context

**Language/Version**: TypeScript; Node.js 22.12 or later to satisfy the current Vite and Vitest toolchain requirements.

**Package Management**: npm workspaces; keep a root lockfile so client and server dependencies install reproducibly.

**Service Dev Runner**: Use `tsx` through Node's `--import` and `--watch` options; use Node's `--env-file` support to load the root `.env` into the local service process.

**Primary Dependencies**: React, Vite 6.4.6, Tailwind CSS with its official Vite integration, Express 5, `better-sqlite3`, a Node WebSocket server library (`ws`), Vitest 5.1.1, and `tsx`. These versions match npm's current audit fix recommendations and Vitest's Node.js 22.12+ requirement. Use Google's official `googleapis` client only in the later Sheets subfeature.

**Storage**: SQLite, owned by the local Node service; enforce group-name uniqueness with a composite database constraint and write operations in transactions.

**Testing**: Vitest unit, API integration, SQLite integration, and WebSocket integration tests. Acceptance runs cover connected local views, phase transition timing, visibility, refresh recovery, and return-to-role from all teacher/student flow states. Unavailable-activity recovery (FR-014) is deferred outside `codex/005`.

**Target Platform**: Same-device local browser views. Bind Vite and Express to `127.0.0.1`; do not listen on a LAN or public interface.

**Project Type**: TypeScript web application with separate Vite client and Express service workspaces plus shared contracts.

**Performance Goals**: Connected views show a committed phase change within 1 second; refreshed or reconnected views restore the current phase within 3 seconds; verify 20 consecutive phase transitions and 10 group enrollments as defined in the spec.

**Constraints**: Keep phase and session context through refresh; persist teacher activity and student group context on their sessions. Returning to role selection is available from every post-role-selection state; it retires only the initiating session and clears its activity/group references and browser session id while retaining activity/group records and the group's reserved name. A teacher's return must not change the activity phase or other student sessions and must not end the activity or transfer control. SQLite is the source of truth. Commit the phase change and revision before broadcasting. Use WebSocket for same-device view synchronization. A group may join only during preparation. Students receive no other group's answer status until the activity ends. Check answer permission by phase without accepting or storing answer content. Run the service only on loopback. No account registration or external-device hosting.

**Security**: Keep all credentials in environment variables; provide a root `.env.example` containing variable names and safe placeholders only; exclude `.env` from version control. Never log credentials, tokens, authorization headers, private keys, or raw environment contents. The Sheets integration is not part of this subfeature; its credential variables and access scope are to be defined in that later plan.

**Scale/Scope**: One local activity workflow with one teacher and multiple student groups/views; acceptance checks cover at least 10 groups and several connected browser views on the same device.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Plan check |
|---|---|
| I. Validated Inputs and Clear Errors | Pass: validate role/session, activity identifiers, group names, phase transitions, session-context reset, API payloads, and WebSocket messages; use clear sanitized error responses. |
| II. Secret Handling | Pass: environment variables only; `.env.example` and `.gitignore` are required bootstrap artifacts; credentials must not enter logs or the client bundle. |
| III. Evidence-Based Testing | Pass: Vitest normal and boundary tests plus local multi-view acceptance checks; report exact test commands and results. |
| IV. Attributed Dependencies and Materials | Pass: record package sources and licenses; use the official Google API client only in the future Sheets subfeature. |
| V. Verifiable Behavior | Pass: React views use Express operations backed by SQLite; the feature is functional and testable rather than a frontend mockup. |
| VI. Clear Structure and Consistent Data | Pass: separate client, service, shared contracts, persistence, and tests; SQLite constraints protect consistency; role reset retires only the initiating session, retains activity/group records and name uniqueness, and leaves other student sessions and activity phase unchanged; commit phase changes before notification. |
| VII. Subfeature-Based Delivery | Pass: artifacts stay under `001-user-stage-sync` on its dedicated branch; Sheets work is deferred to its own future subfeature. |
| VIII. Design-First with PlantUML | Pass: all three source diagrams include recovery reset behavior and their PNGs were regenerated with Java 17; every planned layer maps to the diagrams. |

The loopback-only Express service preserves the spec's no-other-device-server
constraint while supporting local WebSocket views. All constitution gates pass.

## Architecture Derived from PlantUML

The diagrams are the primary architecture source for this plan:

- [Component diagram](../../diagrams/001-user-stage-sync-component.puml) and
  [PNG](../../diagrams/001-user-stage-sync-component.png): React views connect to
  role/activity operations; a shared return control retires only the initiating
  session and clears its activity/group references while retaining activity/group
  records. A teacher return leaves the activity phase and student sessions unchanged. Phase management
  persists through the local service and SQLite; a synchronization component broadcasts only after a successful
  commit; answer-phase guard checks permission without storing answers; answer-
  status access control gates reads.
- [Class diagram](../../diagrams/001-user-stage-sync-class.puml) and
  [PNG](../../diagrams/001-user-stage-sync-class.png): preserve the role, phase,
  user session, activity, group, and answer-status concepts; enforce activity-
  scoped normalized group-name uniqueness; include the phase revision and
  answer-phase guard operation.
- [Sequence diagram](../../diagrams/001-user-stage-sync-sequence.puml) and
  [PNG](../../diagrams/001-user-stage-sync-sequence.png): create and join through
  the service while saving activity/group context on the session, commit a
  phase/revision transition before WebSocket notification, check answer
  permission without saving answer data, and restore refreshed views from the
  latest SQLite state. Every teacher/student flow can return to role selection
  after the service retires the old session and clears its references; its
  future FR-014 unavailable-activity branch will explain the failure and use
  the same control; that behavior is deferred outside `codex/005`;
  activity/group rows and group-name uniqueness remain intact. A teacher return
  does not alter the phase or other students' sessions and does not transfer control.

## Project Structure

### Documentation (this feature)

```text
specs/001-user-stage-sync/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-contracts.md
│   └── ui-contracts.md
├── checklists/requirements.md
└── tasks.md                    # Created by $speckit-tasks

diagrams/
├── 001-user-stage-sync-component.puml / .png
├── 001-user-stage-sync-class.puml / .png
└── 001-user-stage-sync-sequence.puml / .png
```

### Source Code (repository root)

```text
client/
├── src/features/user-stage-sync/
│   ├── components/
│   ├── views/
│   └── services/               # HTTP and browser WebSocket clients
└── vite.config.ts

server/
├── src/features/user-stage-sync/
│   ├── domain/                 # Phase, role, group rules
│   ├── application/            # Activity use cases and access checks
│   ├── api/                    # Express routes and input validation
│   ├── realtime/               # WebSocket subscriptions and events
│   └── persistence/            # SQLite repository and transactions
└── src/app.ts                  # Bind Express/WebSocket to 127.0.0.1

shared/
└── src/user-stage-sync/        # Shared request, response, and event types

tests/
├── unit/
├── integration/
└── acceptance/

.env.example                    # Safe local configuration placeholders
.gitignore                      # Excludes .env and local SQLite data
THIRD_PARTY_NOTICES.md          # Package sources and licenses
```

**Structure Decision**: Use one TypeScript monorepo with separate client and
local service workspaces plus shared contracts. This follows the PlantUML
component boundaries without introducing remote hosting. The Node service binds
to loopback only; the React app is served locally. SQLite is authoritative for
activity phases and groups. Google Sheets is not in this feature's routes,
tables, or runtime dependencies because the user selected deferral to a later
subfeature.

## Complexity Tracking

No constitution violations or extra projects are proposed.
