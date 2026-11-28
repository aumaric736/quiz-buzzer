# Activity, Answer Progress, and Worksheet Import Contract

This contract extends existing authenticated REST and WebSocket interfaces. It introduces no new public service or wire protocol; exact route names and payload schemas remain those of the existing feature modules and shared contracts.

## Upgrade compatibility

- Migration 009 adds nullable `joining_opened_at` and `disconnected_at` fields without changing migration 005.
- Migration 009 adds persisted question display order. Backfill existing questions by ascending `question_number`, since the prior schema did not retain source document order; new imports persist their recognized order.
- For a legacy `準備中` activity with an assigned student member and a ready question/mapping set (at least one question and one or more contiguous mappings on every question), backfill `joining_opened_at` so valid existing team formation remains open and locked. If there is no assigned student or the set is incomplete, leave it null; preserve any existing membership and allow the teacher to complete the set before explicitly opening joining.
- For each non-retired student session with non-null legacy `disconnected_until`, backfill `disconnected_at` from that row's `updated_at`. Preserve its activity, group, and role association; the migrated session is offline and follows the current phase's recovery rule.

## Worksheet import and edit gate

1. Use the existing feature 002 Guided Notes source and authorization flow.
2. Accept the original single-question template and supported variants when `題號`, `題目`, `作答` headers and merged-cell structure uniquely identify question rows and answer mappings. Header columns may move or be reordered; do not require user markers or fixed coordinates.
3. Allow question-count changes, moved/reordered columns, instruction rows, and blank separators. Preserve source question numbers and worksheet order; unique gapped numbers are valid. Mapping slot indexes remain zero-based and contiguous per question, independent of source number.
   Persist the recognized document order as `display_order` and use it when listing questions, progress, and final results. Keep `question_number` as the existing answer/mapping identity; do not sort newly imported sequences numerically. Use the `題目` header to recognize structure without adding prompt persistence or display. Ranking continues to follow feature 004 accepted-submission order.
4. Before persistence, validate the complete selected worksheet. If a question-structured row has no number, a number is duplicated, or layout is ambiguous/unrecognized, reject the whole import and identify the worksheet/row or structural issue. Do not write partial questions or mappings.
5. Teacher may import, replace, or edit the question list while the activity is `準備中` and before opening student enrollment. The explicit teacher `開放加入` operation requires a ready question set; on success it atomically records the one-way opening marker, freezes questions/mappings, and opens team enrollment without changing the activity phase. After opening, reject all import/replacement/question-list edits and preserve existing data even if no student has joined.
6. Authorization failure and unsupported input use the existing safe error envelope and must not disclose activity content.

## Enrollment, presence, and recovery

- New enrollment is permitted only after the teacher has opened joining, while activity phase remains `準備中`, question set is ready, and there is an online vacancy (or group creation is within existing limits).
- Team formation capacity remains two online members. A clean socket close marks offline immediately; an unclean interruption is classified offline after 30 consecutive seconds without heartbeat. Once classified, remove the member from online count and release the online vacancy. Retain association/role for recovery if the original group still has room; otherwise notify the student and offer normal selection of another available group.
- In `搶答進行中`, reject all new-member enrollment and allow existing students to reconnect to the same group/role without a time limit. The heartbeat interval detects offline state; it does not expire reconnect eligibility.
- In `已結束`, reject enrollment, student activity reconnect, and answer submission. Preserve feature 004 authorized read-only result access.
- An ended phase wins a race with enrollment, reconnect, or answer mutation. A join-opening action must also fail unless the activity is still preparing and its question set is ready.

## Teacher roster and answer-progress read model

The teacher-authorized roster includes group identity/name, current online count, and join state. It must not expose seat, occupied-member, or capacity counts. Render online count in a fixed aligned column.

Join state is derived from phase, question readiness, the explicit opening marker, and online capacity:

- `開放加入`: the teacher has opened joining, activity remains preparing, questions/mappings are ready, and an online vacancy exists.
- `停止加入`: answering phase, regardless of offline members or vacancies.
- `不可用`: joining has not been opened, questions are absent/incomplete, no eligible activity state is available, or activity ended.
- `額滿`: joining has been opened, activity remains in team formation (`準備中`), and the group has two online members. Reject another enrollment request for that group. When an online member leaves and the count falls below two, publish `開放加入` with the committed roster update.

During an active activity, teacher progress exposes:

- For each question: valid answered-group count / current total group count. Total groups includes offline groups.
- For the selected question: each group's answered/unanswered state; for answered groups, persisted answer content and current rank.
- Only valid first submissions count. Invalid or duplicate submissions do not increment counts or create ranks. A later team's first valid submission after a winner receives a subsequent rank but does not replace the winner.

The student team-formation screen remains in its existing mode. This contract adds neither a total-question-count display nor question-content preview for students. Active students see only their own team's permitted answer data. Final answer/rank presentation and result authorization follow feature 004; do not add end statistics.

## Realtime and authorization

- Continue the authenticated activity socket and stored-session authorization. Never trust a client-selected group id to grant access.
- Teacher snapshots/events may contain owned-activity roster and answer-progress data. Student active snapshots/events are restricted to their own team and exclude other groups' answer status/content/rank.
- Persist state before publishing. Use existing activity-wide teacher and team-scoped revisions; ignore stale/duplicate revisions and issue an authoritative role-scoped snapshot on reconnect.
- After a committed presence or valid answer change, authorized connected views render the latest state within two seconds at the 100-group/200-session target. Measure the 30-second missed-heartbeat classification separately from the post-commit render target.

## Error behavior

Use existing safe error envelopes. Distinguish at least: question set not ready, joining not opened, import locked after opening, invalid/duplicate question number with worksheet/row, ambiguous worksheet structure, closed activity phase, full group, invalid/retired session, and unauthorized activity access. Denials must not publish unauthorized roster or answer data.
