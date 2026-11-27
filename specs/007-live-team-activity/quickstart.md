# Quickstart: 小組即時狀態與回寫

## Prerequisites

- Node.js `>=22.12` and npm dependencies installed.
- Existing `.env` configuration for the server and Google Sheets service account when validating live Sheets behavior. Do not commit credentials.
- A test spreadsheet using a supported Guided Notes layout, plus a teacher session and student sessions for one activity.

## Start the application

Open two PowerShell windows at the repository root.

In the first window, start the API server:

```powershell
npm.cmd run dev --workspace=server
```

In the second window, start the Vite client:

```powershell
npm.cmd run dev --workspace=client
```

Open the URL printed by Vite, normally `http://127.0.0.1:5173/`.

## Validate member presence and live events

For the two-second check, start the timer when the state-changing operation commits successfully. Stop it when each authorized connected client has applied the newest revision and the corresponding UI state is rendered; receiving a WebSocket event alone does not pass. Record the elapsed time for each eligible client.

1. Open a teacher activity page and two student browser sessions for the same activity.
2. Create a group as the first student. Confirm the teacher roster shows the new group and the leader sees `1/2` and `組長` without reloading.
3. Join the second session using the group invite code. Confirm both student screens show `2/2（已滿額）`, their respective roles, and the teacher roster updates.
4. Disconnect one student. Confirm online count changes to `1/2` within two seconds while the seat stays reserved; a third session cannot take that seat during the grace period.
5. Restore the session before two minutes and confirm it returns to the original role without another seat. In a separate run, leave it disconnected through the deadline; confirm the old session is rejected and the seat is released. Repeat for the leader and confirm the group stops accepting new members after leader expiry.
6. Submit an answer from one team member. Confirm the teammate and teacher see that group's updated answer within two seconds. Confirm a different student team receives no event or data for that answer.
7. Repeat status/answer changes with 100 groups and 200 valid sessions; measure from each successful state commit until every authorized connected view renders the newest state, and verify each completes within two seconds.

## Validate Guided Notes writeback

1. Prepare a complete blank target set and generate a preview; confirm the expiry is five minutes after creation.
2. Confirm before expiry. Verify every written cell is exactly `小組：{displayName}。回答：{答案}。`, where `displayName` is the group's persisted display name (a name or code), including numeric-looking answer text such as `0`.
3. For a separate run, put text, `0`, `false`, whitespace-only text, or a formula (including a formula returning an empty string) in one target. Confirm the entire batch is rejected, all occupied labels are reported, and no target was written.
4. Wait past the five-minute expiry and confirm the stale preview. The screen must offer regeneration. Generate a fresh preview, confirm its new expiry, and complete the normal flow.
5. Confirm no-winner questions remain unchanged and existing provider failure reconciliation remains available.

## Run automated checks

```powershell
npm.cmd test
npm.cmd run build
```

For focused checks, pass a Vitest path filter, for example:

```powershell
npm.cmd test -- tests/integration/user-stage-sync/realtime-and-answer-visibility.test.ts
npm.cmd test -- tests/integration/guided-notes/export-confirmation.test.ts
```

Expected result: unit, integration, and acceptance cases for the feature pass; type-check and client/server/shared builds complete successfully. The 100-group/200-session scenario is a capacity acceptance run, not inferred from a small unit test.
