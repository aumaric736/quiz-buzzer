# Research: 小組加入、即時作答檢視與學習單匯入

## Decision 1: Keep the existing phases and add an explicit join-opening gate within preparation

**Decision**: Keep `準備中`, `搶答進行中`, and `已結束` as the only activity phases. While preparing, the teacher may import, replace, and edit the question set. The teacher's explicit `開放加入` action is allowed only after the question set is ready; that same committed action freezes the worksheet/question list and allows students to enter team formation. Do not add a new activity phase. In preparation before this action, student enrollment is closed. In answering, new enrollment is closed but existing students may reconnect without a deadline. Ended activities reject joining, reconnecting, and answering but preserve feature 004 result access. During upgrade, a legacy `準備中` activity with an assigned student member and a ready question/mapping set is treated as already opened and locked. If it has no assigned students, or the question/mapping set is not ready, leave joining closed; preserve existing membership and allow the teacher to complete the question set before explicitly opening joining. For active legacy student sessions with non-null `disconnected_until`, populate `disconnected_at` from the session's recorded `updated_at` and retain the group association.

**Rationale**: The spec explicitly keeps current activity phases and makes teacher intent, rather than the first student's arrival, the immutable boundary. This prevents an import failure/change racing with student enrollment while keeping the current phase model intact. A persisted one-way join-open marker is needed so imports and enrollment observe the same decision after restarts. Backfilling existing memberships preserves already-started team formation, while carrying forward legacy disconnect state avoids counting offline students as online after upgrade.

**Alternatives considered**: Add a new activity phase, open team enrollment automatically on first student join, or lock the worksheet on first join. Rejected because the user chose no new phase and requires the question set to be fixed before any student can join.

## Decision 2: Separate connection status from team membership and seat eligibility

**Decision**: Persist online/offline state independently from student activity/group association. Detect a clean connection close immediately; classify an unclean interruption as offline after 30 consecutive seconds without heartbeat. During team formation, count only online members for the two-person limit, releasing the vacancy after offline classification while retaining association for conditional recovery. Restore original group/role only if space remains; otherwise offer normal selection of another available group. During answering, preserve membership without an expiry and reject new enrollment.

**Rationale**: Connection state and membership have different lifetimes. Separating them permits immediate vacancy release without losing recovery identity and ensures heartbeat detection does not become a reconnect deadline.

**Alternatives considered**: Retain the old two-minute expiry, clear group association on disconnect, or count offline members against team-phase online capacity. Rejected because each conflicts with the clarified lifecycle.

## Decision 3: Derive teacher join status from phase, readiness, explicit opening, and online capacity

**Decision**: Show join as unavailable before the teacher opens joining or while questions/mappings are incomplete; show open only after opening, while still preparing, and when a group has an online vacancy; show `額滿` in team formation when the online count reaches two; show stopped during answering regardless of vacancies; show unavailable after end. Teacher roster returns online count only, with no seat/occupied/capacity fields, and renders the count in a fixed column.

**Rationale**: Online count alone cannot express whether enrollment is open or blocked because a team is full. The teacher action, phase, readiness, and capacity are authoritative inputs; the `額滿` status communicates the result without exposing a capacity number.

**Alternatives considered**: Derive joinability only from a vacancy, or reveal capacity/occupied counts to explain why joining is closed. Rejected because a vacancy during answering must not reopen enrollment and the teacher only needs online count.

## Decision 4: Extend the existing teacher live read model and role-scoped events

**Decision**: Show teacher per-question valid answered-group count / total current group count, including offline groups in the denominator. For a selected question, show answered and unanswered groups; answered groups include saved answer content and current rank. Extend existing authenticated REST/WebSocket, post-commit publication, and revision ordering. Keep active student answer information restricted to their own group. During team formation, keep the existing student screen and do not add total-question-count or question-content display.

**Rationale**: The existing live infrastructure and teacher activity view can provide the requested teacher progress without a new service. The user confirmed the current student screen should remain unchanged.

**Alternatives considered**: Add a student question count/list preview during team formation, poll for teacher progress, or broadcast all group answers to students. Rejected because the user explicitly requested current student behavior and role-scoped live delivery.

## Decision 5: Reuse feature 002 worksheet import and feature 004 result rules

**Decision**: Reuse the existing Guided Notes source/authorization flow. Identify the original single-question template and supported variants using `題號`, `題目`, `作答` headers plus merged-cell structure rather than fixed coordinates or user-added markers. Allow question-count changes, moved/reordered columns, instructions, and blank separators. Persist recognized document order separately from the original question number; gaps are valid and question reads must not sort by number. Existing rows have no stored document order, so migration 009 backfills them by ascending `question_number`; new imports preserve source order. Reject the entire import with sheet/row diagnostics when a question-structured row has a missing/duplicate number or the layout is ambiguous. Commit a valid replacement as one complete set. Permit edits only until `開放加入`; reject later import/replacement/question-list edits and leave data unchanged. Use `題目` to recognize worksheet structure but do not add prompt persistence or display.

For ranking, each team's first valid submission per question uses the persisted effective receive/record order from feature 004. Later first submissions still receive subsequent ranks but do not replace the winner. Ended results and authorization remain under feature 004; no new final statistics or student question preview is added.

**Rationale**: Reusing existing import/result ownership preserves source access and ranking semantics while the new teacher action provides a deterministic freeze boundary.

**Alternatives considered**: Require template markers/fixed coordinates, skip invalid rows, renumber questions, permit changes after opening, recompute ranks from client timestamps, or expand final metrics. Rejected by the spec and existing feature ownership.

## Technology and repository decisions

- Use the existing TypeScript 5.9, Node.js >=22.12, React 19, Vite 6, Tailwind CSS 4, Express 5, WebSocket (`ws`), SQLite (`better-sqlite3`), shared-contract, and Vitest 5.1.1 stack.
- Keep changes in the existing `client`, `server`, and `shared` workspaces and feature boundaries: `user-stage-sync`, `buzzer-flow`, and feature 002 Guided Notes import.
- Add no package, service, external format, new activity phase, or role. No external research is needed because the clarified behavior and project stack are defined by the spec and repository.

## Current repository findings

- Migration files are discovered by filename (`NNN-*.sql`), sorted, and applied transactionally by the existing database initializer. Migration 009 therefore needs no explicit migration registration in `database.ts`; it must follow existing migration 008 and leave migration 005 unchanged.
- The current presence service uses a two-minute `disconnected_until` deadline and eventually retires the session and clears team association. The new behavior must replace that deadline policy: team formation releases online capacity while retaining association, answering preserves membership for unlimited reconnect, and ended phase rejects reconnect.
- Current team capacity is based on assigned active sessions, and enrollment is gated only by `phase`. The new gate and capacity checks must use the durable teacher-open marker and online presence; a returning team-phase student whose previous vacancy was filled needs an explicit path to choose another group.
- Existing roster snapshots and revisions already flow through the authenticated WebSocket. Keep that channel and revise the teacher projection to online count plus authoritative join state while preserving any separate student enrollment fields needed by the join UI.
- Existing Guided Notes parsing, owner/phase checks, and transactional import are split across `layout-recognizer.ts`, `import-guided-notes.ts`, and `guided-notes-repository.ts`. The parser currently assumes the three headers are in left-to-right order and skips question-shaped rows whose number is blank; 008 must recognize supported moved/reordered columns and diagnose missing numbers on question rows.
- `activity_questions` currently persists `question_number` but no source display order. Import and read paths sort by question number, so non-numeric worksheet order cannot survive import or appear consistently in teacher progress. Add persisted `display_order`, carry document order through save/list/progress/result reads, and retain `question_number` as the existing answer/mapping identity. The database migration backfills existing rows in ascending `question_number` order because their former worksheet order was not stored.
- The existing import stores question numbers and blank mappings, not prompt text. The `題目` header is needed to recognize worksheet structure, but this feature does not add prompt persistence or display.
- Buzzer submissions already have persisted acceptance order, per-activity serialization, and post-commit WebSocket events. Add an authorized teacher progress read model and extend existing publication/revision behavior instead of creating a second realtime channel.

## Research completion

All product decisions are specified by the 2026-11-28 clarifications. No unresolved technology or integration questions remain for design.
