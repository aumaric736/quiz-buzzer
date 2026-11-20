# Quickstart: 課堂搶答結果檢視與檢討

## Start the local application

From the repository root, install the existing locked workspace dependencies if needed:

```powershell
npm.cmd ci
```

Start the API and browser client in separate PowerShell terminals:

```powershell
npm.cmd run dev --workspace=server
```

```powershell
npm.cmd run dev --workspace=client
```

Open the Vite `Local` URL printed in the client terminal (normally `http://127.0.0.1:5173/`). The API is at `http://127.0.0.1:3000/` and does not serve the React page at `/`.

This feature reads local SQLite records and does not require Google Sheets access. Use the existing environment configuration only when testing Guided Notes separately; never place real credentials in a command, test fixture, or log.

## Focused validation scenarios

1. Create an activity, import a question set, join two student groups, and start the buzzer.
2. Submit one valid answer from the first group, then another valid answer for the already-won question from the second group. Both groups' first valid answers are recorded; only the first remains the winner. Submit again as the first group and verify the duplicate is rejected and not ranked.
3. Submit answers on a second question in reverse question order. After end, verify each question's rank starts at 1 and reflects that question's own receipt order.
4. Leave one imported question unanswered. After end, verify both the student result and teacher review list that question as unanswered with no fabricated record.
5. Before end, verify a student view has no complete results or other-group details. After end, verify the student sees only winner/no-answer results and the owner teacher sees all answer records, group names, answer parts, per-question rank, and winner marker.
6. Attempt teacher history access as a non-owner or before end and verify a clear denial with no records.
7. Create a new activity. Verify it has no inherited submissions; select the old activity from the teacher activity-history list and read its records. A student must view old results before joining the new activity; after switching, that student session cannot read old results.

## Validation commands and results

Run each phase's test command and require it to pass before moving to the next implementation phase. These commands were run from the repository root:

```powershell
npm.cmd test -- tests/integration/results-review/schema-migration.test.ts tests/integration/buzzer-flow/answer-submission.test.ts tests/integration/buzzer-flow/schema.test.ts tests/integration/buzzer-flow/realtime-visibility.test.ts tests/unit/buzzer-flow/buzzer-flow-service.test.ts tests/unit/buzzer-flow/winning-answer-provider.test.ts tests/unit/buzzer-flow/answer-status-access.test.ts
npm.cmd test -- tests/integration/results-review/student-results.test.ts tests/acceptance/buzzer-flow/final-results.test.tsx tests/integration/user-stage-sync/realtime-and-answer-visibility.test.ts
npm.cmd test -- tests/integration/results-review/teacher-review.test.ts tests/acceptance/results-review/teacher-history.test.tsx
npm.cmd test -- tests/unit/buzzer-flow/winning-answer-provider.test.ts tests/unit/buzzer-flow/answer-status-access.test.ts tests/integration/results-review/student-results.test.ts tests/integration/guided-notes/export-preview.test.ts tests/integration/guided-notes/export-confirmation.test.ts
npm.cmd test -- --run tests/integration/results-review/student-results.test.ts tests/acceptance/buzzer-flow/final-results.test.tsx
npm.cmd test
npm.cmd run build
java -jar plantuml.jar "./diagrams/*.puml"
```

Results:

- **Phase 2**: Passed — 7 test files, 18 tests.
- **Phase 3**: Passed — 3 test files, 7 tests.
- **Phase 4**: Passed — 2 test files, 3 tests (including the teacher review rendering case in the final suite).
- **Phase 6 T024 and Phase 7 T025**: Passed — 5 test files, 19 tests, including no-winner-marker and later-rank winner-marker inconsistency regressions.
- **Phase 8 T026**: Passed — 2 test files, 4 tests, including the student new-activity switch entry and old-result access revocation after switching.
- **Full Vitest suite**: Passed — 42 test files, 123 tests.
- **Workspace build**: Passed — shared, server, and client TypeScript/Vite production builds.
- **PlantUML render**: Passed — component, class, and sequence PNGs regenerated in `diagrams/`.

`vitest.config.ts` limits concurrent workers to 4 so local CPU contention does not make the existing real-time synchronization latency checks flaky.
