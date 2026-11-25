# Quickstart: 全狀態返回角色選擇

## Prerequisites

- Node.js `>=22.12` and npm
- Dependencies installed from the repository root (`npm install`)

## Run locally

Terminal 1 (API):

```powershell
npm run dev --workspace=server
```

Terminal 2 (client):

```powershell
npm run dev --workspace=client
```

Open the local Vite URL printed by the client process. The app uses the local loopback API.

## Acceptance walkthrough

1. Select Teacher; create/open an activity and use the return-to-role control. The chooser appears only after reset completes.
2. Select Student; join a group, then return. Select Student again and confirm a fresh session is used and the old group association is not inherited. Existing group data/name remains in the activity.
3. Return a teacher while students remain active. Confirm activity phase/revision and student sessions are unaffected.
4. Simulate a transient reset failure: confirm the current flow and stored session id remain, and retry is available.
5. Use a stale/missing session id: confirm the client clears it and returns to the chooser.

## Automated verification

```powershell
npm test
npm run build
```

The implementation report records the latest full-suite/build evidence. Vitest integration tests cover API lifecycle/isolation; acceptance tests cover reset ordering, failure/missing-session handling, and return-control rendering across the existing flow states.

Unavailable-activity recovery is deferred and is not part of this walkthrough.
