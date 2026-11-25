# Implementation Report: 使用者角色與活動階段同步

**Branch**: `codex/001-user-stage-sync`  
**Date**: 2026-11-18  
**Status**: Complete

## Verification

| Command / check | Result |
|---|---|
| `npm ci` | PASS — clean install completed from `package-lock.json`. |
| `npm test` | PASS — 17 test files, 52 tests. Includes normal and boundary tests for roles, activity lifecycle, group enrollment, WebSocket synchronization, answer visibility, answer-phase checks, and refresh/reconnect recovery. |
| `npm run build` | PASS — shared, Express server, migration asset copy, and React/Vite production build completed. |
| `npm audit --omit=dev` | PASS — 0 runtime dependency vulnerabilities. |
| `java -jar plantuml.jar "./diagrams/*.puml"` | PASS — regenerated all three PNG files from their `.puml` sources. |
| Loopback service smoke check | PASS — started the service with a temporary, secret-free `.env` and in-memory SQLite; `/health`, teacher session creation, and activity creation returned `ok`, `準備中`, revision `0`. The temporary `.env` was removed after the check. |

## Acceptance Measurements

Timing assertions use `performance.now()` in the acceptance tests:

- Activity creation API response: under the 30-second target.
- Committed phase update delivered to connected teacher and student views: under 1 second.
- Reconnect after a server-side socket disconnect restores the latest saved phase: under 3 seconds.
- Twenty valid transitions across ten fresh activities and ten distinct group enrollments were verified by tests.

## Diagram Alignment

Implementation flows were checked against the component, class, and sequence diagrams in `diagrams/`. The code follows the diagram boundaries for local role/activity APIs, SQLite persistence, revisioned phase updates, WebSocket subscriptions and broadcasts, answer-status access control, and answer-phase permission checks. Activity creation and group enrollment persist session context transactionally; phase events publish only after commit. The answer-phase guard accepts no answer payload and stores no answers. Refresh restores session and group context plus the authoritative phase; reconnect fetches the latest snapshot and ignores stale revisions.

All three generated PNGs were inspected after rendering. The sequence diagram includes the implemented subscription authorization/snapshot acknowledgement and session-context recovery flows.

## Dependency Audit Note

The runtime-only audit is clean. The full `npm audit` still reports five high-severity findings in the development toolchain's transitive `picomatch`/`fdir`/`tinyglobby` chain used by Vite/Vitest. Vite and Vitest are development dependencies; the app server binds to `127.0.0.1`. An audit-suggested downgrade to Vite 6.2.7/Vitest 3.1.4 produced two critical `tinypool` advisories during verification, so the compatible Vite 6.4.6/Vitest 5.1.1 pair was retained. The remaining dev-toolchain findings are recorded for the next update.

## codex/005 Role-Return Implementation

The `返回角色選擇` control is mounted in the shared app shell, so it remains available throughout teacher and student flows. Activating it calls `POST /api/sessions/{sessionId}/reset-context`; the server transaction clears that session's activity/group references and records `retired_at`. Activity and group rows remain intact, including the normalized group-name reservation. Resetting a teacher does not change the activity phase or other student sessions. A retired or missing session cannot be restored or used for activity operations; repeating reset is idempotent. The client clears the stored session id only after reset succeeds, discards an already-missing session id, and retains the current state when the reset request fails so the user can retry.

Unavailable-activity recovery was explicitly deferred and is not included in this implementation. The quickstart marks that step as deferred.

Validation on 2026-11-25 (Asia/Taipei):

- Focused Vitest: `C:\Program Files\nodejs\node.exe node_modules/vitest/vitest.mjs run --reporter=verbose --silent=false tests/acceptance/user-stage-sync/local-views.test.ts tests/integration/user-stage-sync/sessions-api.test.ts tests/integration/user-stage-sync/activities-api.test.ts` — 3 files, 11 tests passed in 2.76 seconds.
- Full suite: `npm test` (invoked as `C:\Program Files\nodejs\node.exe C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js test` with Node 26 first on `PATH`) — 42 files, 129 tests passed in 12.95 seconds.
- Production build: `npm run build` (same Node 26 npm-cli invocation) — shared, server, and client builds passed; Vite production bundle completed in 825 ms.
- The acceptance reset API returned in 21.9 ms in the focused run (under the 3-second recovery threshold). The automated quickstart acceptance path verified reset ordering, retry behavior, missing-session fallback, role reselection, group/name retention, and preservation of the live activity and other sessions.
- Commands ran with Node 26.13.1 because the installed `better-sqlite3` native module uses ABI 147; Node 24.22.3 and the Node 22 runtime in the default shell cannot load that module. No dependencies were downloaded or rebuilt.

## Phase 9 Convergence

T049 extracts the persistent return action into the shared `ApplicationShell` used by the app entry. The acceptance test renders that shell with eight representative teacher/student flow states and verifies the role-return control remains present. The existing return-operation acceptance checks verify clear-after-success ordering, retry after a failed reset, and missing-session fallback.

T050 aligns FR-014 scope across the spec, plan, data model, API/UI contracts, research decisions, task notes, and all three architecture diagrams. Unavailable-activity recovery remains documented as future feature intent and is explicitly deferred outside `codex/005`.

Validation on 2026-11-25 (Asia/Taipei):

- `npm test` (Node 26.13.1 via npm-cli) — 42 files, 130 tests passed in 14.37 seconds.
- `npm run build` (same Node runtime) — shared, server, and client builds passed; Vite production bundle completed in 1.05 seconds.
- The three user-stage-sync PlantUML diagrams were regenerated with Eclipse Temurin JDK 17.0.21 and visually inspected.
- `git diff --check` completed without whitespace errors.
