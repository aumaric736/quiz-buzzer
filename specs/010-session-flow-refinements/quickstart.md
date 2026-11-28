# Quickstart: Session Flow Refinements

## Prerequisites

- Node.js 22.12 or newer and npm installed.
- Repository dependencies installed with `npm install`.
- Run commands from the repository root.

## Focused validation

Run the presence, departure, roster, and teacher phase scenarios:

```powershell
npx vitest run tests/integration/user-stage-sync/group-departure.test.ts tests/integration/user-stage-sync/phase-aware-presence.test.ts tests/integration/user-stage-sync/live-team-realtime.test.ts tests/acceptance/user-stage-sync/team-joining-open.test.tsx tests/acceptance/buzzer-flow/teacher-phase-flow.test.tsx
```

Expected coverage includes:

1. The teacher always sees both 「開始加入」 and 「開始答題」: before joining opens only 「開始加入」 is enabled; after joining opens only 「開始答題」 is enabled; after answering starts both are disabled.
2. An explicit leader return promotes the remaining online member during team formation and allows another student to join while the activity is open and an online seat is available.
3. A leader heartbeat timeout at 30,000 ms (29,999 ms remains online) produces the same promotion and frees an online seat without retiring the disconnected session.
4. A returning former leader does not reclaim leadership; if two other students have filled the online seats, existing recovery behavior requires reassignment.
5. If a leader leaves with no remaining online members, the team stays joinable during the joining stage; its first new joiner becomes leader.
6. Teacher roster and student team snapshots receive one revision increment per committed transition and reflect the committed leader/presence state within five seconds of detection.
7. Answering-stage and ended-activity joining restrictions remain in force.

Run the full Vitest suite after focused scenarios pass:

```powershell
npm test
```

The implementation phase must report the exact commands and outcomes. These commands are documented for later validation and were not run during planning.
