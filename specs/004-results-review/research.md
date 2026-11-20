# Research: 課堂搶答結果檢視與檢討

## Decisions

### 1. Store every group's first valid submission for each question

- **Decision**: Continue using the existing `buzzer_submissions` table as the durable attempt history. Add a per-question `submission_rank` and an `is_winner` marker. Allow later groups' first valid submissions while the activity remains live, even after a question already has a winner. The existing first committed row stays the winner.
- **Rationale**: The feature requires complete teacher review history and ranks. The current unique `(activity_id, question_number)` constraint and `classifyClosedQuestion` path only retain a winner and reject every later group. One table avoids dual-write consistency between separate attempt and winner stores.
- **Alternatives considered**: Keep only the winner row (does not satisfy complete history); add a separate attempt table plus the current winner table (duplicates answer data and requires atomic dual writes); accept multiple rows without per-group uniqueness (would permit duplicate submissions).

### 2. Assign rank inside the existing immediate SQLite transaction

- **Decision**: Calculate `MAX(submission_rank) + 1` for the activity/question and insert the attempt inside the synchronous immediate transaction. Keep global `accepted_order` for stable acceptance order and winner selection. Enforce unique activity/question/rank and activity/question/group constraints in SQLite.
- **Rationale**: Existing submission and phase-transition paths already use synchronous transactions. Allocating rank within the transaction avoids duplicate ranks and makes order stable after reload. The spec defines rank separately for each question.
- **Alternatives considered**: Derive ranks in the UI or query time (rank could shift when records change); trust a client timestamp (clocks can disagree); allocate rank outside the transaction (concurrent requests could collide).

### 3. Migrate the existing winner row as the first ranked record

- **Decision**: Add a new numbered SQLite migration that rebuilds `buzzer_submissions` with the new constraints, copies each existing winning row using `submission_rank = 1` and `is_winner = 1`, and recreates indexes.
- **Rationale**: SQLite cannot remove the existing unique-question constraint in place. The migration runner applies ordered SQL migrations transactionally; rebuilding the table preserves the existing answer, identity, and accepted order without rewriting prior migrations.
- **Alternatives considered**: Edit migration 003 (breaks databases that already applied it); add a duplicate attempt store (dual-write risk); drop old results (violates data preservation).

### 4. Keep existing winner summaries and Guided Notes provider winner-only

- **Decision**: Filter current teacher live status, student final summary, and `WinningAnswerProvider` to `is_winner = 1`. The new review-record query reads every submission row.
- **Rationale**: Existing shared `WinningAnswerResult` and Guided Notes export contracts describe one winner or no winner per question. Multiple teacher-history records must not change those contracts.
- **Alternatives considered**: Return all attempts from `WinningAnswerProvider` (breaks existing Guided Notes semantics); choose a winner from UI order (not authoritative or stable).

### 5. Keep result reads HTTP-based and role-specific

- **Decision**: Retain existing `GET /answer-status` for student final winner/no-answer results and live own-submission status. Add a teacher-owner-only, ended-phase `GET /review-records` route for complete attempt history. Do not broadcast answer history over WebSocket.
- **Rationale**: Current result access already checks owner or joined group and the activity phase. WebSocket currently only synchronizes phase and teacher live winner projections. Ended data is durable and can be retrieved as a single snapshot.
- **Alternatives considered**: Add attempt details to WebSocket messages (unneeded, increases privacy surface); send teacher records to the shared student endpoint (violates the role boundary); poll records while live (outside the post-end review scope).

### 6. Scope historical access to existing activity ownership/membership

- **Decision**: Keep old records under their immutable `activity_id`. The owner teacher can query the old activity after creating another activity. A student can query only while their current session still points to the old activity/group; joining a new activity replaces that current association and removes student access to the old result.
- **Rationale**: Existing `user_sessions` stores one current activity/group association. The user chose not to retain prior student access after switching, so adding a membership-history subsystem would be unnecessary scope.
- **Alternatives considered**: Persist membership history across activities (not requested and changes identity/data scope); delete old records on new activity (loses teacher review history).

### 7. Provide owner navigation to earlier activities

- **Decision**: Add a teacher-only activity-history list so the owner can select an ended activity and open its saved review records after creating a new activity.
- **Rationale**: The teacher view holds only the currently selected activity. Without navigation, keeping old rows in SQLite would not make the prior history practically reviewable from the UI. The existing owner session ID can filter the list without a new identity or membership model.
- **Alternatives considered**: Require the teacher to remember and manually type activity IDs (error-prone); retain every activity in in-memory component state (lost on reload); introduce global membership/history roles (unnecessary).

### 8. Reuse the project stack and avoid Sheets changes

- **Decision**: Use TypeScript shared contracts, Express routes, SQLite repositories, React views, and Vitest. Do not add dependencies or call Google Sheets from this feature. Keep existing official `googleapis` access and credentials in environment variables for the separate Guided Notes feature.
- **Rationale**: The stack is specified by the user and already installed. Results review consumes local persisted answers; it has no Sheets read/write requirement. Existing `.env.example` and `.gitignore` are the credential boundary.
- **Alternatives considered**: Add a new store/service or fetch Sheets during review (duplicates data and introduces external availability to a local result view); add a library for table rendering (unnecessary dependency).

## Existing Code Evidence

- `buzzer_submissions` currently has one row per activity/question and stores the winner; the transaction is in `server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts`.
- `readAnswerStatus` and `loadEndedAnswerResults` currently assume one row per question and need explicit winner filters after the schema expands.
- Student and teacher result screens use `StudentJoinView.tsx`, `TeacherActivityView.tsx`, and `QuestionResultList.tsx`; the latter does not model multiple records or ranks.
- `database.ts` applies sorted numbered migrations in a synchronous transaction; current tests use real SQLite and Express app instances.
- PlantUML blueprints: `diagrams/004-results-review-component.puml`, `diagrams/004-results-review-class.puml`, and `diagrams/004-results-review-sequence.puml`.
