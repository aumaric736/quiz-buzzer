# Quickstart Validation: 使用者角色與活動階段同步

This guide runs the local React client, Express/WebSocket service, SQLite
storage, and Vitest suite from the repository root. The service only listens on
loopback and does not accept connections from other devices.

## Prerequisites

- Node.js 22.12 or later and npm.
- Dependencies are installed and the local SQLite schema is created
  automatically when the Express service starts.
- The Vite client and Express/WebSocket service bind to loopback only.

## Setup and Run

From the repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Run the service and client in separate terminals from the repository root:

```powershell
npm run dev --workspace=server
```

```powershell
npm run dev --workspace=client
```

`.env.example` contains safe local settings such as `HOST=127.0.0.1`, a local
port, the Vite client origin, and the SQLite file path. It contains no
credentials. `.gitignore` excludes `.env`, local SQLite files, and build
artifacts. Google Sheets variables are intentionally absent until the later
Sheets subfeature defines its data contract.

Open the local URL printed by Vite. Do not use a LAN address: this feature's
Express and Vite listeners must remain bound to `127.0.0.1`.

## Automated Tests

Run the Vitest suite with:

```powershell
npm test
```

The root `test` script invokes `vitest run`. The suite includes unit,
Express/SQLite integration, WebSocket integration, and recovery acceptance
tests.

## Manual Acceptance Run

1. Open the local app as a teacher and start a timer. Within 30 seconds, create
   an activity and confirm the `準備中` phase is saved in SQLite.
2. Open connected student views in the same device/browser environment. Join
   groups with 10 distinct valid names; confirm each view displays `準備中`.
3. Try a duplicate name, a case-only difference, and a name with surrounding
   spaces. Confirm all duplicates are rejected and no extra SQLite row appears.
4. Try to join after the teacher starts the activity. Confirm the request is
   rejected and the group count is unchanged.
5. As a student, request the answer-attempt check during `準備中`. Confirm it
   is rejected with `ANSWER_NOT_STARTED` and a clear not-started message; no
   answer content is accepted or stored.
6. Start the activity as teacher. Confirm SQLite commits the new phase before
   the WebSocket event and all connected views update within 1 second. Verify
   consistency across 20 consecutive transitions across fresh test activities.
7. Request other groups' answer status as a student while the activity is
   running. Confirm the API denies access and includes no answer data.
8. Refresh a teacher and student view. Confirm session context is restored and
   the API returns the latest SQLite phase within 3 seconds. Reconnect while a
   newer phase exists and confirm stale WebSocket events do not roll it back.
9. End the activity. Confirm all views display `已結束`, answer-status reads are
   permitted for future answer data, new groups cannot join, and the answer-
   attempt check returns `ANSWER_ACTIVITY_ENDED` with a clear message.

## Completion Evidence

Record the exact `npm test` command and pass/fail result in
`specs/001-user-stage-sync/implementation-report.md`, including the normal and
boundary cases run and measured activity-create, phase-sync, and recovery times.
