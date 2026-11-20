# Quickstart: 課堂搶答流程

## Start the Local App (Windows PowerShell)

From the repository root, install locked workspace dependencies once:

```powershell
npm.cmd ci
```

Open two PowerShell terminals in the repository root.

Terminal 1 — server:

```powershell
npm.cmd run dev --workspace=server
```

Terminal 2 — Vite client:

```powershell
npm.cmd run dev --workspace=client
```

Open the Vite `Local` URL printed in Terminal 2 (normally `http://127.0.0.1:5173/`). The API runs on `http://127.0.0.1:3000/`; it does not serve the React page at `/`.

Guided Notes import/export requires the existing server-account environment settings. If the local `.env` does not exist, copy the placeholder file and set credentials locally without committing it:

```powershell
Copy-Item .env.example .env
```

No new environment variables are introduced by this feature. Share the test Guided Notes file with the configured service account using the existing Guided Notes setup.

## Focused Verification

Run focused feature tests after each implementation phase, and stop before proceeding if a phase test fails:

```powershell
npm.cmd test -- tests/unit/buzzer-flow
npm.cmd test -- tests/integration/buzzer-flow
npm.cmd test -- tests/acceptance/buzzer-flow
```

Final verification:

```powershell
npm.cmd test
npm.cmd run build
```

Report the exact command and actual test/build result. Do not describe the feature as verified until the relevant commands have passed.

## Verification Record (2026-11-20)

- `npm.cmd test -- tests/unit/buzzer-flow tests/integration/buzzer-flow tests/acceptance/buzzer-flow` — passed: 11 test files, 23 tests.
- `npm.cmd test -- tests/integration/user-stage-sync/realtime-and-answer-visibility.test.ts` — passed: 1 test file, 4 tests, including the T032 mismatched group/activity subscription rejection.
- `npm.cmd test` — passed: 38 test files, 112 tests.
- `npm.cmd run build` — passed for shared, server, and client TypeScript builds; Vite production bundle completed.
- `java -jar plantuml.jar "./diagrams/*.puml"` — passed; regenerated the colocated PlantUML PNGs, including the component, class, and sequence diagrams for this feature.
- Log review found no answer payload, request body, provider payload, or credentials passed to log calls. `.gitignore` contains `.env` and `.env.*` exclusions and keeps `!.env.example`; `.env.example` remains present.

## Manual Acceptance Walkthrough

1. Select the teacher role, create an activity, and import a Guided Notes sheet so the server has question numbers and blank counts.
2. Join the activity from student views using distinct group names; verify the teacher can see group membership.
3. Before starting, submit an answer and confirm the server rejects it with the preparation-phase message.
4. Start the activity. It remains open until the teacher manually ends it; elapsed time does not end it automatically. Submit ordered answer parts for a multi-blank question from two groups in close succession; exactly one succeeds. Submit a second time from the winning group and verify the duplicate message.
5. Confirm the teacher sees the winner update without refresh. Confirm student views show only their own acceptance and do not receive the other group's name or answer.
6. End the activity while a submission is being attempted. Verify submissions serialized before end appear in results and submissions after end are rejected.
7. Reload/reconnect a student and teacher view; confirm phase/status restore from server state. After end, joined students can view full results, including questions with no winner.
8. Trigger Guided Notes export and verify the provider supplies the persisted group/answer for every imported question, with no-winner entries preserved.
