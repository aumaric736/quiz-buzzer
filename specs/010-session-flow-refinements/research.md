# Research: Session Flow Refinements

## Decisions

### Reuse the current WebSocket presence detector

- **Decision**: Keep the existing WebSocket ping/pong cadence and inclusive 30-second student offline grace. Perform leader handoff when the current presence service classifies a student offline; treat a clean close/return as immediate.
- **Rationale**: `student-session-presence-service.ts` already defines `STUDENT_OFFLINE_GRACE_MS = 30_000`, changes `disconnected_at`, increments group and activity live revisions, and calls team/teacher publishers. The WebSocket server pings every 10 seconds and computes the remaining grace after a dropped connection. The boundary is 29,999 ms online and 30,000 ms offline; the transaction owner performs exactly one revision increment per departure transition.
- **Alternatives considered**: Add a separate leader heartbeat or client polling loop. Rejected because leaders are student sessions using the same WebSocket presence path, and a second detector would duplicate timers and create inconsistent online states.

### Promote through the existing group and session records

- **Decision**: On a leader departure during `準備中`, atomically demote the departing leader, promote the remaining online member and update `groups.leader_session_id`; if there is no online successor, clear the leader pointer. If a student later joins an empty leaderless group, assign that student the leader role. Preserve session association for heartbeat-timeout recovery; explicit return retires and detaches the departing session after handoff. Do not change `groups.accepts_members` merely because a leader leaves.
- **Rationale**: The group already stores `leader_session_id`; each session stores `group_role` and `disconnected_at`. This is enough to represent handoff without a migration. Demoting former leaders prevents them from appearing as leader if they reconnect. Explicit return currently retires the session through `session-routes.ts`/`session-service.ts` and does not publish group or roster events; wire those publishers into the return path after the transaction commits. Run the role updates and revisions in the caller's transaction so reconnect, capacity, and live event readers do not observe partial handoffs.
- **Alternatives considered**: Add a leader history or a new presence table. Rejected because the specification needs only one current leader and the existing records contain the necessary state.

### Keep team capacity and reconnect rules authoritative

- **Decision**: Capacity is two online student seats. A disconnected non-retired session remains associated for recovery but does not consume an online seat. A returning student remains offline and must be reassigned if two other students have filled the seats. A leader departure does not close enrollment.
- **Rationale**: The spec removes the leader-departure block but retains the two-person online capacity and existing recovery behavior. Current presence recovery already keeps a returning session offline when two other students are online.
- **Alternatives considered**: Retire all offline leaders automatically. Rejected because a heartbeat timeout is a presence state, not a confirmed choice to leave, and existing recovery preserves the session's group relationship.

### Extend existing live events rather than add endpoints

- **Decision**: Extend the teacher roster's group record with the current leader's online state. Continue using `team.presence.updated` for member-facing `groupRole`, counts, capacity, and `acceptsMembers`. Publish both events after the handoff transaction commits and use existing live revisions to reject stale events.
- **Rationale**: Existing publishers already broadcast team presence and teacher roster updates for WebSocket disconnects. Student snapshots already contain the recipient's `groupRole`; the teacher roster currently lacks a leader presence field. Explicit returns currently bypass these publishers, so pass the existing publishers through the session route and publish after retirement commits. A small shared-contract extension lets both views reflect the handoff without polling or a new HTTP route.
- **Alternatives considered**: Add a new leader-changed event or poll endpoints. Rejected because existing revisioned snapshot events already deliver the necessary current state.

### Derive the teacher's stage action from the activity state

- **Decision**: Keep 「開始加入」 and 「開始答題」 visible together. Before joining opens, enable only 「開始加入」; after joining opens, enable only 「開始答題」; after answering starts, disable both. Keep both disabled after the activity ends and retain the separate 「結束活動」 control while answering.
- **Rationale**: The user explicitly requires persistent side-by-side controls and provides the enabled/disabled sequence. Existing activity phase and `joiningOpenedAt` determine the state without changing persistence.
- **Alternatives considered**: Hide or replace one control as the stage changes. Rejected because this conflicts with the clarified UX requirement.

### Use existing TypeScript and Vitest workspaces

- **Decision**: Implement within the current TypeScript 5.9 monorepo; use React 19, Vite 6, Tailwind CSS 4, and existing Vitest 5.1.1 tests. Add no package dependencies.
- **Rationale**: These are the user-specified stack and the project’s installed dependencies and established testing patterns.
- **Alternatives considered**: Replace the test or UI framework. Rejected because there is no feature requirement that justifies framework changes.
