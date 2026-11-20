# Data Model: 課堂搶答流程

This model follows [the buzzer-flow class diagram](../../diagrams/003-buzzer-flow-class.puml). Existing SQLite activity, session, group, and Guided Notes question tables remain authoritative for identity, membership, lifecycle, and question numbers. This feature adds durable accepted winning submissions; live events are projections of saved rows, not the source of truth.

## Existing Entities Used

### Activity (`activities`)

The activity owns the existing lifecycle `準備中` → `搶答進行中` → `已結束`, revision, and teacher session. This feature reuses the phase and monotonic revision; it does not add a second phase model.

### ActivityQuestion (`activity_questions`)

The activity's imported Guided Notes question numbers. Each number is unique within its activity and is the key used for answer submission and provider results. The number and question set are immutable after the activity leaves preparation.

### StudentGroup (`groups`)

An existing group joined to one activity. Student sessions reference the group and activity. The submission service must verify the session's group belongs to the requested activity.

## New Entity

### WinningAnswerSubmission (`buzzer_submissions`)

Represents the first valid answer accepted for one question. A submitted row is also that question's winner; no row means the question has no winner.

| Field | Required | Validation / meaning |
|---|---|---|
| `accepted_order` | Yes | Database-generated monotonic order for accepted submissions. It is not supplied by a client. |
| `activity_id` | Yes | Existing activity foreign key. |
| `question_number` | Yes | Must reference a question imported for this activity. |
| `group_id` | Yes | Must reference a group belonging to this activity. |
| `answer_parts_json` | Yes | JSON array of ordered non-empty strings; item count equals detected blank count. |
| `accepted_at` | Yes | Server-side acceptance timestamp; client timestamps are ignored. |

**Uniqueness**: `(activity_id, question_number)` is unique, enforcing one winner per question. `(activity_id, group_id, question_number)` may also be declared unique to make the one-accepted-submission-per-group/question rule explicit. The first uniqueness rule is stronger for the current “question closes after first accepted answer” flow.

**Foreign keys**: `(activity_id, question_number)` references `activity_questions(activity_id, question_number)`. `(activity_id, group_id)` references the activity/group pair. Add a unique index on `groups(activity_id, id)` in the new migration if needed to support the composite foreign key; do not rewrite prior migrations.

Rejected submissions are not persisted. This avoids storing unnecessary answer content and means retry feedback is derived from the winning row: own prior winner → duplicate-submission error; a different winning group → generic question-closed error.

## Derived Entity

### QuestionResult (`WinningAnswerResult`)

Built from every imported `ActivityQuestion` left-joined with `buzzer_submissions` after the activity ends.

- Winner row present: return question number, winner group id/name, and answer parts in input order.
- No winner row: return the question number with `winner: false`.
- The result set is sorted by imported question number and contains exactly one record per imported question.
- Reject provider reads before `已結束`, for an unknown activity, or if persisted data does not match the imported question set.
- A winner's answer-part count must equal that question's Guided Notes blank mapping count.

## Relationships

- One activity has one or more imported questions before it can start.
- One activity has zero or more groups.
- One question has zero or one accepted winning submission.
- One group has zero or one accepted submission per question; under the winner-lock rule, only one group's submission can exist for a question.
- One ended activity produces one `QuestionResult` for every imported question.

## Invariants and Transactions

1. Starting the activity validates that its imported question set and blank mappings are present, consistent, and non-empty.
2. Once phase is not `準備中`, the question set and blank mappings cannot be changed by a Guided Notes import.
3. Submission validates session role, activity membership, activity phase, question number, blank count, non-empty answer parts, duplicate group submission, and winner existence.
4. Phase validation, current-winner check, and the winning row insert occur in one synchronous immediate SQLite transaction. Phase transition validation and update (especially ending) also occur in one synchronous immediate transaction; no phase read that controls a transition occurs before its transaction begins. The transaction is never held across an `await` or WebSocket send.
5. A unique database constraint is the final guard against two winners. The first request to commit a valid row wins; client clock values cannot change the result.
6. The phase-ending transition and accepted-answer insert use the same database connection and immediate-write transaction mode, so their write transactions serialize. If the submit commits first, its answer remains in final results; if the end transition commits first, the submit is rejected.
7. Emit teacher live updates after the answer commit only. If a socket send fails, the persisted status endpoint and reconnect snapshot remain authoritative.
8. After end, the provider returns persisted winners and explicit no-winner values for every imported question. No answer can be changed after end.

SQLite transactions provide serializable isolation, while `better-sqlite3` supports an immediate transaction mode for acquiring the write transaction before the read/check/insert path. See [SQLite isolation](https://www.sqlite.org/isolation.html), [SQLite transaction modes](https://www.sqlite.org/lang_transaction.html), and [`better-sqlite3` transactions](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).

## Privacy Boundary

- Teacher status views may contain group names and submitted answers while live.
- Student live reads expose only that student's own accepted submission status; live events never contain another group's answer or winner identity.
- After end, all joined students and the activity teacher may view final results.
- Do not log answer parts or full submission/provider payloads. Do not send those fields in a student's submission error response.
