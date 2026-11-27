# Research: 小組即時狀態與回寫

## Decision 1: Extend the existing application stack and feature boundaries

**Decision**: Use TypeScript 5.9 and the current React 19, Vite 6, Tailwind CSS 4 client; Express 5, `ws`, SQLite, and Google Sheets gateway on the server; Vitest 5.1 for tests. Add no dependency.

**Rationale**: These are the active workspaces and libraries in `package.json`; existing feature modules already implement activity sessions, WebSocket subscriptions, group capacity, Guided Notes parsing, preview attempts, and Sheets writes.

**Alternatives considered**: A new real-time service, another frontend framework, or a separate database. Rejected because the feature is bounded to the existing 100-group activity and the current architecture already owns all required state and integrations.

## Decision 2: Send scoped real-time changes after committed state transitions

**Decision**: Extend the existing activity WebSocket and shared event contracts. Add teacher-only `activityLiveRevision` and group-scoped `groupLiveRevision` counters, stored as `activities.live_revision` and `groups.live_revision`, separate from the existing activity phase revision. Teacher subscriptions receive activity-wide roster changes and team answer changes. Student subscriptions receive only their own team's member-count and answer changes. On reconnect, recover an authoritative role-scoped snapshot before resuming incremental events. Increment the applicable counters in the same SQLite transaction as each corresponding state change and publish only after commit.

**Rationale**: `server/src/features/user-stage-sync/realtime/websocket-server.ts` already authenticates the teacher owner and joined students, and `client/src/features/user-stage-sync/services/activity-socket.ts` already reconnects and recovers snapshots. The current stream sends activity phase and teacher-only winning-answer events, so the new payloads must add roster and per-team answer visibility without widening student access. The existing activity phase revision is visible to students and therefore must not be reused for answer ordering; the teacher-only `activityLiveRevision` and group-scoped `groupLiveRevision` avoid exposing a global answer sequence.

**Alternatives considered**: Polling or broadcasting all activity answers to every subscriber. Polling cannot reliably meet the two-second update target without excess repeated reads; global broadcast would reveal other teams' answer state. Reusing the student-visible activity phase revision for answer changes was rejected because it would leak global event order. A full activity snapshot on every event was also rejected in favor of bounded roster updates and single-team/single-question deltas.

## Decision 3: Separate online count from reserved membership capacity

**Decision**: Display online members, not merely non-retired sessions. A disconnected member stops counting as online immediately, while their seat remains reserved until the existing two-minute deadline. Keep expiry, seat release, and leader closure in the existing student-presence transaction, then publish the roster change.

**Rationale**: The user explicitly asked for online member count. Existing `group-repository.ts` counts every non-retired session, including sessions in the reconnect grace period; that count remains appropriate for occupied capacity but not the requested online display. `student-session-presence-service.ts` already owns the deadline, revocation, and group closure logic.

**Alternatives considered**: Display all non-retired sessions as the online count. Rejected because it would show a disconnected student as online for two minutes. Releasing the seat at disconnect was rejected because it would break the existing recovery grace period.

## Decision 4: Make preview expiry recoverable and validate the entire target set before writing

**Decision**: Change export preview lifetime from 15 minutes to five minutes. On expiry, keep the teacher on the export flow and create a new preview with a new ID and expiry. Use the stored mappings to resolve target coordinates independently from whether a target is still blank; preview and confirmation can therefore identify every occupied target instead of failing layout recognition at the first occupied cell. Immediately before confirmation, re-read all mapped target cells and reject the whole batch if any target has entered text after trimming the specified leading/trailing whitespace, a non-empty scalar value, or a formula (including a formula that displays an empty value). Preserve formula presence in the Sheets cell model. For each writable slot, write `小組：{winningGroupName}。回答：{answerPart}。`; preserve answer text as received. Keep no-winner slots unchanged.

**Rationale**: `build-export-preview.ts` currently sets a 15-minute lifetime. `confirm-guided-notes-export.ts` already re-reads the sheet, checks the answer snapshot, writes through one Sheets batch, verifies the outcome, and records retry states. `GoogleSheetsGateway` currently maps entered/effective values but does not model formula presence separately. The existing layout recognizer treats a filled target as a missing blank; confirmation must instead use the imported mapping/structure fingerprint to resolve target cells, then separately validate occupancy. Central preflight across every target avoids partial overwrite and can identify all occupied target labels.

**Alternatives considered**: Reuse the stale preview and merely extend its expiry; rejected because answers or cells may have changed. Check/write each cell separately; rejected because it permits partial writes. Treat a formula whose displayed result is blank as an empty target; rejected because the write would replace an existing formula. Re-run blank-dependent layout recognition on confirmation; rejected because it cannot enumerate all occupied target cells or report them together.

## Decision 5: Keep the existing seat and role lifecycle, with explicit old-session revocation

**Decision**: Preserve the existing two-minute student session restore window. At expiry, retire and clear the old activity/group identity, release a member seat, and close future enrollment if the expired session was the leader. Rejoin after expiry uses the existing new-session flow; the old session ID remains invalid. Serialize expiry and new enrollment through the existing immediate SQLite transactions.

**Rationale**: `student-session-presence-service.ts` already persists `disconnected_until`, reconciles it after restart, and transactionally retires expired sessions; `group-service.ts` enforces the two-seat and leader-closure rules. The missing behavior is publishing the corresponding roster update and ensuring stale identity cannot subscribe again.

**Alternatives considered**: Add a second timer or separate membership database. Rejected because it duplicates lifecycle state and can race the existing seat checks.

## Existing project references

- Realtime subscription and event delivery: `server/src/features/user-stage-sync/realtime/websocket-server.ts`, `client/src/features/user-stage-sync/services/activity-socket.ts`, `shared/src/user-stage-sync/contracts.ts`.
- Group state and expiry: `server/src/features/user-stage-sync/application/group-service.ts`, `student-session-presence-service.ts`, `persistence/group-repository.ts`.
- Sheets preview and confirmation: `server/src/features/guided-notes/application/build-export-preview.ts`, `confirm-guided-notes-export.ts`, `google-sheets/sheets-gateway.ts`, `google-sheets/google-sheets-gateway.ts`.
- Existing tests to extend: `tests/integration/user-stage-sync/realtime-and-answer-visibility.test.ts`, `session-restore.test.ts`, `group-departure.test.ts`, `tests/integration/guided-notes/export-preview.test.ts`, `export-confirmation.test.ts`, `export-reconciliation.test.ts`, and `tests/acceptance/guided-notes/export-preview.test.tsx`.

## Research completion

No unresolved technology or integration questions remain for Phase 1. The requested frontend and test stack matches the repository configuration.
