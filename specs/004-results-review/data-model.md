# Data Model: 課堂搶答結果檢視與檢討

This model follows [the results-review class diagram](../../diagrams/004-results-review-class.puml). Existing activity, question, group, and session tables remain authoritative. All attempt and result data is scoped by `activity_id`; there is no same-activity restart or cross-activity student membership history.

## Existing Entities Used

### Activity (`activities`)

Owns the lifecycle `準備中` → `搶答進行中` → `已結束`, its teacher owner, and its immutable question set after start. Only the owner teacher may read full review records. A new activity gets a new ID; an ended activity remains unchanged.

### ActivityQuestion (`activity_questions`)

The imported Guided Notes question numbers. Every review response includes each imported question once. A question with no submitted answer has an empty record list and an explicit unanswered status.

### StudentGroup (`groups`)

The group whose student session submitted an answer. Every record validates that the group belongs to the same activity. Group display name is read from this table.

## Expanded Entity: AnswerSubmission (`buzzer_submissions`)

One valid first submission by a group for a question while the activity is live. Records after another group has won are retained for teacher review, but cannot replace the winner.

| Field | Required | Validation / meaning |
|---|---|---|
| `accepted_order` | Yes | Database-generated global commit order; used to preserve original accepted order and identify the first winner. |
| `activity_id` | Yes | Existing activity foreign key. |
| `question_number` | Yes | Imported question number in the same activity. |
| `group_id` | Yes | Group belonging to the same activity. |
| `answer_parts_json` | Yes | Ordered JSON array of non-empty trimmed strings; count equals that question's blank count. |
| `accepted_at` | Yes | Server-generated acceptance timestamp; client timestamps are ignored. |
| `submission_rank` | Yes | Positive integer rank scoped to one activity/question; allocated in the same write transaction as the row. |
| `is_winner` | Yes | Boolean marker; exactly the first committed valid submission for each question is true. Later group submissions are false. |

### Uniqueness and Foreign Keys

- `UNIQUE(activity_id, question_number, group_id)`: at most one valid submission per group/question.
- `UNIQUE(activity_id, question_number, submission_rank)`: ranks cannot collide within one question.
- Partial unique index on `(activity_id, question_number) WHERE is_winner = 1`: at most one winner per question.
- `(activity_id, question_number)` references the imported activity question.
- `(activity_id, group_id)` references a group belonging to the activity.
- Existing winner rows are migrated as `submission_rank = 1`, `is_winner = 1`, preserving their `accepted_order`, timestamp, and answer parts.

Invalid, blank, malformed, post-end, nonmember, and same-group duplicate submissions are rejected and not stored. A different group may submit its first valid answer after a winner exists as long as the activity remains live; it is stored with the next rank and `is_winner = 0`.

## Derived Views

### Student QuestionResult

Build one row per `activity_questions` row and left-join only the `is_winner = 1` submission. A winner row returns question number, group, and ordered answer parts. No winner row returns explicit unanswered status. The existing `WinningAnswerProvider` continues to receive only winners/no-winner results for Guided Notes export.

### Teacher SubmissionReview

Available only to the activity owner after end. Return every question in imported order; for each question, return its submitted records ordered by `submission_rank`, with group ID/name, answer parts, rank, and winner marker. An unanswered question has an empty list and explicit unanswered status.

## Relationships and Invariants

- One activity has one or more imported questions before it starts and zero or more groups.
- One question has zero or more submission records and at most one winner record.
- One group has at most one record per question.
- Per-question rank starts at 1 and increases in committed valid submission order; it never changes after insert.
- A valid first submission wins only if no winner exists when its immediate transaction checks and inserts. A later valid group submission is review history, not a winner change.
- Submission and end transitions use synchronous immediate transactions on the same SQLite database. An answer commits before end or is rejected after end; no answer is recorded after the ended transition.
- A new activity uses a different activity ID and has no prior records. Old submissions stay tied to the old ID. The owner teacher retains access; a student can read old results only while their session still references that activity/group.
- Teacher full-history reads and student final-result reads are post-end snapshots; no attempt details are broadcast over WebSocket.

## Privacy and Logging

- During the live phase, student reads/events expose no other group's submission or winner details. A student's own acceptance acknowledgement does not state whether another group already won.
- After end, joined students may read only winner/no-answer results. Only the owner teacher may read all records and non-winning answers.
- Do not log answer parts, full submission requests, review payloads, or Google service-account credentials.
