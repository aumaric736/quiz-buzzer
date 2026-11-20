# Research: 課堂搶答流程

## Decision 1: Reuse the existing activity lifecycle and Guided Notes question list

**Decision**: Keep the existing `ActivityPhase` values and activity owner/session model. Opening and ending the buzzer extend the existing preparation → live → ended transition. Starting requires at least one imported question, and the imported question set is frozen once the activity leaves preparation.

**Rationale**: The first subfeature already persists phases and revisions and authorizes teacher-owned transitions. Guided Notes has already established the per-activity `activity_questions` table and blank mappings. Reusing these sources avoids divergent question numbers and prevents a mid-activity reimport from invalidating submitted answers.

**Alternatives considered**:

- A second buzzer-only lifecycle: rejected because clients and existing WebSocket subscriptions already use the canonical `ActivityPhase` and phase revision.
- A second question-number table: rejected because it could drift from Guided Notes and break the answer provider contract.

**Existing references**: `shared/src/user-stage-sync/contracts.ts`, `server/src/features/user-stage-sync/application/activity-service.ts`, `server/src/features/user-stage-sync/persistence/activity-repository.ts`, and `server/src/features/guided-notes/persistence/guided-notes-repository.ts`.

## Decision 2: Persist only accepted winning submissions; enforce the winner with a transaction and unique constraint

**Decision**: Store one accepted winning submission per activity question. Validate the student session, group membership, active phase, imported question, blank count, non-empty answer parts, and whether the question is still open within the same short synchronous write transaction. Use an immediate transaction and a database uniqueness constraint on `(activity_id, question_number)` so only one submission can win. Do not use a student device timestamp to decide priority. Publish a live teacher update only after the commit succeeds.

**Rationale**: The product rule defines the winner as the first valid answer successfully accepted, not the earliest client clock. SQLite transactions serialize writes; `better-sqlite3` exposes immediate transactions, and SQLite uniqueness constraints reject conflicting inserts. Keep the transaction synchronous and do not await WebSocket work inside it. A losing submission cannot overwrite the existing winner.

**Alternatives considered**:

- Trusting client timestamps: rejected because device clocks can differ and can be manipulated.
- Read-then-write without one transaction: rejected because concurrent requests could both observe an unanswered question.
- Persisting every rejected attempt: rejected because the user-facing result and Guided Notes integration require the accepted winner, while rejected payloads do not need long-term storage.

**Sources**: [SQLite isolation and `BEGIN IMMEDIATE`](https://www.sqlite.org/isolation.html), [SQLite transaction modes](https://www.sqlite.org/lang_transaction.html), [SQLite uniqueness-conflict behavior](https://www.sqlite.org/conflict.html), [`better-sqlite3` transaction API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).

## Decision 3: Implement the existing Guided Notes provider contract from durable records

**Decision**: Implement a server-side `WinningAnswerProvider` backed by persisted submissions and the activity's imported question list. It is available only after the activity is ended and returns exactly one ordered result for every imported question: winner group and answer parts, or `winner: false`. Validate question coverage and answer-part counts before exposing results.

**Rationale**: Guided Notes already defines `WinningAnswerProvider.getResults(activityId)` and validates a complete per-question result set. Durable database rows survive refresh, reconnect, and server restarts; WebSocket messages or client state are not authoritative provider data.

**Alternatives considered**:

- Returning only questions with winners: rejected because Guided Notes requires an explicit result for every imported question to distinguish no-winner questions.
- Reading answers from transient WebSocket state: rejected because export occurs after the activity ends and must work after reconnect or restart.
- Implementing Google Sheets reads/writes here: rejected because the Guided Notes subfeature owns the official Sheets client and environment credentials; this feature only supplies the result contract.

**Existing contract**: `shared/src/guided-notes/contracts.ts` (`WinningAnswerProvider`, `WinningAnswerResult`).

## Decision 4: Keep answer visibility role-filtered at every read and realtime boundary

**Decision**: Teacher status reads and live question-result events may contain submitted group and answer data. During a live activity, student reads contain only their own accepted-submission status, submission responses acknowledge only that student's request, and student WebSocket subscriptions receive no other-group status or answer event. After end, authorized students and teachers may read complete results. Reconnects re-read a role-filtered snapshot from persisted data.

**Rationale**: The existing WebSocket server currently broadcasts phase changes to every authorized subscriber and stores the subscriber's session identity. Answer details cannot be added to that broadcast unchanged. A role-aware event publisher and role-filtered status query preserve current phase synchronization while preventing answer leakage.

**Alternatives considered**:

- Broadcast answer events to every activity subscriber: rejected because students must not see another group during the live phase.
- Treat the WebSocket connection as the source of truth: rejected because reconnects and export must be based on persisted results.

**Existing references**: `server/src/features/user-stage-sync/realtime/websocket-server.ts`, `server/src/features/user-stage-sync/application/answer-status-access.ts`, and `client/src/features/user-stage-sync/services/activity-socket.ts`.

## Decision 5: Keep Google credentials and answer payloads out of logs

**Decision**: Do not add Google API access or new credentials to this feature. Reuse the existing Guided Notes provider injection. Log only event names, activity identifiers where already permitted, and stable error codes; do not log submitted answer parts, provider result payloads, private credentials, or raw request bodies.

**Rationale**: The Guided Notes adapter already owns service-account access through environment variables. The buzzer feature needs to return results internally, not access Sheets. Answer text is submitted classroom data and should not appear in routine logs.

**Alternatives considered**:

- Giving the buzzer feature a separate Sheets service account/client: rejected because it duplicates credentials and breaks the established feature boundary.
- Logging answers to debug concurrency: rejected because it exposes student answer content without a product need.

## Decision 6: Extend current TypeScript, Express, SQLite, WebSocket, and Vitest workspaces without adding dependencies

**Decision**: Keep the feature in the existing npm workspaces and dependency versions. Use React, Vite, Tailwind CSS for views; Express routes and application services for validation/flows; SQLite for durable accepted submissions; the existing `ws` server for role-filtered live updates; and Vitest fake/repository/API/acceptance coverage. Add one ordered SQLite migration and no third-party package.

**Rationale**: The repository already has these packages, test conventions, and offline-capable fakes. No additional service or package is required for the local single-class scope.

**Sources**: [official `ws` repository](https://github.com/websockets/ws), [`better-sqlite3` license and source](https://github.com/WiseLibs/better-sqlite3), [SQLite transaction documentation](https://www.sqlite.org/lang_transaction.html).
