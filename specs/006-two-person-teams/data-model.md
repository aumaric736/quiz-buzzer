# Data Model: 小組活動與逐題搶答

This design extends the existing SQLite model and follows the feature diagrams in `../../diagrams/006-two-person-teams-{component,class,sequence}.puml`. Existing `activities`, `user_sessions`, `groups`, `activity_questions`, `buzzer_submissions`, and Guided Notes export tables remain authoritative where available.

## Activity (`activities`)

| Field | Meaning / rule |
|---|---|
| `id` | Existing opaque activity ID, displayed as the activity join code. |
| `phase` | Existing lifecycle: preparation, live, ended; ended is terminal. |
| `created_by_session_id` | Authenticated owner teacher session; one owner per activity. |
| `teacher_disconnect_deadline` | Nullable UTC instant, set when the owner's final socket disconnects unexpectedly; reconnect clears it; expiry ends the activity. |
| `revision` | Existing monotonic activity revision. |

Credentials remain deployment configuration and are not stored in the activity or session tables.

## UserSession (`user_sessions`)

Extend existing opaque sessions with group membership state:

| Field | Meaning / rule |
|---|---|
| `id` | Opaque session ID. A session may have multiple device/socket connections but occupies one group seat. |
| `role` | Existing teacher/student application role. |
| `activity_id`, `group_id` | Existing activity/team context. A group session must refer to a group in the same activity. |
| `group_role` | New nullable `leader` or `member` value for student group sessions. |
| `disconnect_deadline` | New nullable UTC instant set on unexpected closure of the session's last socket; cleared when that session reconnects. |
| `retired_at` | Existing leave/expiry marker. Explicit leave retires immediately; elapsed deadline retires on timeout or startup reconciliation. |

Student identity is session/team scoped; no personal name or student number is collected. A new invite-code join/rejoin creates a new session. A session within its two-minute reconnect window restores the existing session rather than consuming another seat.

## StudentGroup (`groups`)

| Field | Meaning / rule |
|---|---|
| `id` | Existing internal opaque group ID. |
| `activity_id` | Parent activity. |
| `invite_code` | New six-character numeric string, leading zeroes preserved; random on the server and unique within this activity. A collision causes a new random value to be generated. Other activities may use the same value. |
| `leader_session_id` | New session ID of the leader; leader's active session occupies one of two seats. |
| `leader_left_at` | Nullable instant. Set on explicit leader leave or leader-session expiry; the group then rejects new member sessions. Existing member sessions remain usable until they leave/expire. |
| `display_name` / `normalized_name` | Do not request a free-form team name in this flow. For compatibility with existing views, derive display name from the invite code. |
| `joined_at` | Existing creation timestamp. |

Create a group and its leader membership atomically. Enforce maximum 100 groups and same-activity invite-code uniqueness inside a SQLite immediate transaction. A failed creation creates neither a group nor an occupied session. Invite codes do not disclose group creation order/count. Wrong-code attempt counts are not limited.

## Group membership seat rules

The group cap applies to active **membership sessions**, not human identity or socket count:

- At most two student sessions per group may be non-retired and not beyond their disconnect deadlines; the leader session is one of the two.
- Multiple sockets/devices authenticated as the same session share its one seat and the group's answer state.
- Member join with an invite code creates a new member session and succeeds only while fewer than two sessions are active and the leader has not left.
- Rejoining by invite code creates a new session; it succeeds only if a seat is available. If full, reject even if the requester is the same real person as a previous session because the system cannot identify that person.
- Last socket unexpected close sets that session's persisted deadline to current time plus two minutes. Reconnect before expiry clears it and restores the original seat. At expiry the session is retired and the seat is released. Explicit leave retires immediately and releases the seat.
- If the leader explicitly leaves or expires after the disconnect grace, set `leader_left_at`; reject new memberships. Other active group sessions can continue until they explicitly leave or expire.
- A member leave/expiry releases its seat for a new member if the leader remains active.
- Mandatory MVP capacity acceptance covers 100 groups with two active membership sessions each (200 total): every session can join and appear in the teacher roster, each group submits one valid answer, and its other session sees the shared answer; resubmission does not create a second accepted answer.

Teacher group projections expose invite code and `activeSessionCount` only; they never expose student names, numbers, or membership session IDs. The UI labels this as active sessions, not verified students or headcount.

The group invite code is a fixed-width six-character numeric string. Leading zeroes are significant and must be preserved from generation through storage, API responses, and input validation (for example, `004271`).

## AnswerSubmission (`buzzer_submissions`)

Reuse the existing one-answer-per-group/question shape. Preserve each group's first valid answer and the one winner per question.

| Field | Meaning / rule |
|---|---|
| `accepted_order` | Per-activity server receipt sequence; not exposed to students. |
| `activity_id` | Owning activity. |
| `question_number` | Must belong to the activity's imported question set. |
| `group_id` | Same-activity group with a valid non-retired membership session. |
| `answer_parts_json` | Original submitted strings; trim only when checking for blank input. |
| `accepted_at` | Server timestamp. |
| `submission_rank` | Per-question order of first valid submissions by distinct groups. |
| `is_winner` | True only for the lowest receipt sequence among valid submissions for that question. |

Required invariants:

- `UNIQUE(activity_id, question_number, group_id)`; all group sessions share one answer slot per question.
- `UNIQUE(activity_id, question_number, submission_rank)` and at most one winner per activity/question.
- Invalid, malformed, blank, wrong-activity, ended-activity, or unauthorized submissions create no answer row and consume no answer rank or group/question slot.
- A duplicate exact retry returns the original acknowledgment; a changed answer is rejected and cannot replace the first answer.
- A winner does not close a question to other groups. All groups may submit until activity end; live cross-group data is teacher-only.
- Knowledge correctness is not evaluated; the first valid answer supplies both the result and writeback content.

## ActivityOperationReceipt (ordering ledger)

Persist a unique monotonically increasing sequence per fully received answer request and teacher end/timeout operation.

| Field | Meaning / rule |
|---|---|
| `activity_id` | Activity whose operation is ordered. |
| `receipt_sequence` | Unique increasing integer within the activity. |
| `operation_type` | `answer`, `teacher_end`, or `teacher_timeout`. |
| `received_at` | Time after the complete request body is parsed, or the timeout instant. |
| `outcome` | Accepted or rejected; never stores answer contents. |

Allocate sequence and apply the operation in the same per-activity synchronous queue/SQLite immediate transaction. Invalid answer requests consume operation sequence but not accepted rank or answer eligibility. Student responses/events never include the global sequence.

## DraftAnswer (device-local)

Unsubmitted text stays in browser local storage keyed by activity ID, group ID, and question number. It restores only on that device. Accepted answers are read from SQLite and shared by the group. Switching groups never moves committed answers or exposes drafts under the new group.

## FinalResult and ExportAttempt

At end, expose one result per imported question. The first valid group submission wins and its original raw answer is used in results and Sheets writeback. No valid submission returns `無有效作答／無勝組`; its mapped cell is `略過` and remains unchanged. Students may fetch the immutable final result using only the activity join code; this read-only lookup creates no session or group seat, even if that team's seats are full or expired.

Reuse `guided_notes_export_attempts` to retain pending/failed/unknown post-end writes and safe retry state. Retry cannot reopen the activity, change the final result, or duplicate a write. Ended activities retain groups, sessions, submissions, immutable results, and export attempt status.

## Lifecycle relationships

- One configured teacher session owns an activity.
- One activity has zero to 100 groups and an imported question set.
- One group has a random invite code unique within its activity and up to two active membership sessions.
- One session has zero or one group role; one group session can have several sockets/devices.
- A group has at most one leader session and at most one other active membership session.
- One group submits once per question; a question has one winner or no winner.
- Teacher explicit leave ends immediately. Teacher unexpected disconnect deadline is two minutes; expiration ends once. Answer and end operations share order.
