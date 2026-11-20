# HTTP and Realtime Contracts: 課堂搶答流程

This contract follows the component and sequence diagrams in `../../../diagrams/003-buzzer-flow-component.puml` and `../../../diagrams/003-buzzer-flow-sequence.puml`. Every route uses `X-Local-Session-Id` for the existing local session. Validate path parameters, JSON shape, number ranges, and array contents; errors use the existing `{ code, message }` response envelope and contain no answer or credential data unless the successful caller is authorized to see the result.

## Shared Types

```ts
type QuestionPrompt = { questionNumber: number; blankCount: number };
type AnswerSubmissionRequest = { questionNumber: number; answerParts: string[] };
type AnswerSubmissionAck = { accepted: true; questionNumber: number };

type TeacherQuestionStatus =
  | { questionNumber: number; status: 'open' }
  | { questionNumber: number; status: 'won'; groupId: string; groupName: string; answerParts: string[] };

type StudentOwnStatus = { questionNumber: number; status: 'submitted' };
type FinalQuestionResult =
  | { questionNumber: number; winner: false }
  | { questionNumber: number; winner: true; winningGroupId: string; winningGroupName: string; answerParts: string[] };
```

The final provider result reuses `WinningAnswerResult` from `shared/src/guided-notes/contracts.ts`. Do not duplicate or alter that contract.

## `POST /api/activities/:activityId/phase`

Existing request: `{ "phase": "搶答進行中" | "已結束" }`.

- Only the activity's teacher may transition the phase, and only in sequence.
- Opening validates a non-empty question list and a positive, consistent blank mapping for each question. If absent, return `409 QUESTIONS_REQUIRED` with a message directing the teacher to import Guided Notes first.
- A successful transition returns the existing `ActivitySnapshot` and publishes the existing answer-free `activity.phase.updated` event.
- A duplicate, invalid, unauthorized, or out-of-order transition returns the repository's `{code,message}` error shape and leaves the phase unchanged.

## `GET /api/activities/:activityId/questions`

Allowed for the activity teacher and joined student. Returns sorted imported questions:

```json
{"questions":[{"questionNumber":1,"blankCount":2}]}
```

Unknown activity/session and non-member access return explicit 4xx errors. The server returns no question descriptions or answer keys.

## `POST /api/activities/:activityId/answers`

Student session only; session must be joined to a group in this activity.

```json
{"questionNumber":1,"answerParts":["first blank","second blank"]}
```

On accepted commit: `201 {"accepted":true,"questionNumber":1}`. There is exactly one entry per detected blank, each a string with non-empty trimmed content. Server ignores any client timestamp/order fields and rejects unknown extra request fields.

Errors are atomic and do not change the existing winner:

| Status/code | Condition | Public message meaning |
|---|---|---|
| 400 `INVALID_ANSWER` | Bad JSON shape, question number, part count, or blank part | Identify the field requirement without echoing answer text. |
| 403 `STUDENT_REQUIRED` / `ACTIVITY_MEMBERSHIP_REQUIRED` | Teacher, non-member, or wrong activity | Select/join the matching student group. |
| 404 `ACTIVITY_NOT_FOUND` / `QUESTION_NOT_FOUND` | Unknown activity/question | Recheck activity or imported question. |
| 409 `BUZZER_NOT_OPEN` | Preparation or ended phase | Submission is allowed only while the buzzer is active. |
| 409 `DUPLICATE_SUBMISSION` | Same group already submitted that question | First submission remains recorded. |
| 409 `QUESTION_CLOSED` | Another group already won | Question is closed; do not identify the winner or answer. |

## `GET /api/activities/:activityId/answer-status`

Response depends on caller role and phase; unauthorized roles never receive another group's live data.

- Teacher, live: `{ "phase":"搶答進行中", "items": TeacherQuestionStatus[] }`, one entry for every imported question (`open` or `won`).
- Joined student, live: `{ "phase":"搶答進行中", "items": StudentOwnStatus[] }`, containing only questions this group's accepted submission succeeded for. Do not include winner group, answer, other submissions, or winner/open counts.
- Teacher or joined student, ended: `{ "phase":"已結束", "items": FinalQuestionResult[] }`, one entry per imported question; no-winner questions are explicit.
- Preparation: return `{ "phase":"準備中", "items":[] }` for a joined student. The teacher may read the same empty projection until start. Never expose an answer before a successful submission or expose any winner data to students before end.

## WebSocket (`/ws`)

Subscription remains `{"type":"activity.subscribe","activityId":"…","sessionId":"…"}`. Authorization is rechecked against the persisted session, role, activity owner, group membership, and phase. Subscription acknowledgement carries the phase/revision snapshot, never answer content.

- Existing `activity.phase.updated` broadcasts remain answer-free and go to authorized activity subscribers.
- On accepted answer commit, send `buzzer.question.updated` with the teacher projection (`activityId`, `questionNumber`, status, winner group id/name, ordered answer parts) to the activity's teacher socket(s) only. Never send this event to student sockets.
- The submitter receives the HTTP acknowledgement only; it must not contain any competitor status.
- Phase transition to ended is broadcast. Clients then fetch `GET .../answer-status` to obtain final results; a server may include the same authorized final projection in a separate end event only if it applies the same role filter.
- On socket reconnect or page reload, client resubscribes and fetches HTTP snapshots. Socket events are notifications, not the durable source of truth.

## Provider Contract

Implement the existing `WinningAnswerProvider.getResults(activityId)` on the server. It rejects unknown or non-ended activities. For ended activities it returns exactly one sorted result for every `activity_questions.question_number`, with `winner:false` when there is no submission or winner group id/name plus ordered answer parts when there is one. It validates complete question coverage and blank-part counts before returning. Guided Notes is responsible for calling this provider during export; no direct Google Sheets calls are added here.
