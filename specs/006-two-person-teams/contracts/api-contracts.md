# API Contracts: 小組活動與逐題搶答

All endpoints use the existing Express JSON API and opaque `X-Local-Session-Id`. The server validates role, session state, activity, group membership, phase, and payload; client state does not grant authorization.

## Teacher sign-in and activity

### `POST /api/teacher/login`

Request: `{ "username": string, "password": string }`

Success: authenticated teacher session and active activity summary if one exists. Validate against `TEACHER_USERNAME` and `TEACHER_PASSWORD` on the server. Never persist or log credentials. Invalid login returns generic `401 INVALID_CREDENTIALS`.

### `POST /api/activities`

Authenticated teacher only. Create a preparation activity and return existing `activityId` as its displayed activity join code. The creating teacher session is the sole owner.

### `POST /api/teacher/activities/{activityId}/leave`

Owner-only explicit leave. Order with answer submissions, end immediately, freeze results, and begin/continue the Guided Notes export flow. Terminal and idempotent.

### Teacher presence

A valid owner WebSocket subscription marks that session connected. On the last owner socket closing unexpectedly, persist `teacherDisconnectDeadline = now + 2 minutes`; reconnect before expiry clears it. Expiry and startup reconciliation end the activity. Order timeout with answer submissions.

## Student activity and group enrollment

### `POST /api/activities/join`

Request: `{ "activityCode": string }`

Success: student session associated with the activity before group selection. The existing activity ID is the join code.

### `POST /api/activities/{activityId}/groups`

Leader creation request: `{ "mode": "leader" }`. The current ungrouped student session becomes the group's leader session and first active seat. Server generates a fixed-width six-character numeric string (preserve leading zeroes), unique within this activity. On collision, generate another random code atomically. Return `{ "groupId": string, "inviteCode": string, "activeSessionCount": 1 }`.

Member join request: `{ "mode": "member", "inviteCode": string }`. Require a fixed-width six-character numeric string (including leading zeroes), same-activity code, open group, preparation phase, and fewer than two active membership sessions. Bind the caller's session to the group with member role and return the shared group identity and active session count.

The two-seat limit counts active persisted membership sessions, not people or sockets. The leader session occupies one seat. Several sockets/devices using the same session ID occupy one seat. Rejoin by invite code creates a new session and requires a free seat; it is rejected when full, even if the requester is the same person as an expired session. No personal student identity or student number is asserted. Wrong-code attempt counts are not limited.

The random code is scoped by activity: different activities may use the same fixed-width six-character numeric string. Invalid, unknown, full, closed, wrong-activity, or ended-activity join attempts cause no partial membership/session update. Use generic errors that do not reveal other groups. Reject the 101st group with `409 GROUP_LIMIT_REACHED`.

### Student leave and membership disconnect

The existing session retirement route explicitly leaves immediately. Leader leave sets the group closed to new membership sessions; other active sessions can continue. Member leave frees its seat if the leader remains active.

When the last WebSocket for a student session closes unexpectedly, persist a two-minute `disconnectDeadline`. A reconnect with the same session ID before expiry clears the deadline and retains its seat. Expiry retires the session and releases the seat. Leader expiry also closes the group to new sessions; member expiry releases the seat if the leader remains. Startup reconciliation applies elapsed deadlines. Multiple sockets for one session do not create separate seats.

Teacher group projection contains each invite code and `activeSessionCount` only, never names, student numbers, or session IDs. The count is active membership sessions, not verified student headcount.

## Per-question answer submission

### `POST /api/activities/{activityId}/answers`

Request: `{ "questionNumber": positive integer, "answerParts": string[] }`. Each request is exactly one question. Assign the receipt sequence after the complete body is parsed. Validate each part as nonblank after trimming boundaries, but persist the original string.

The activity must be live; the caller must be a non-retired student session in a group in that activity; the question and blank structure must match the imported question set; and the group must not already have a valid answer for that question. Invalid requests create no answer row, do not consume group/question eligibility or accepted rank, and may be corrected before end.

First valid submission by a group returns only its acknowledgment and own answer. Exact retry returns its original acknowledgment; changed-answer retry returns `409 GROUP_QUESTION_ALREADY_SUBMITTED` without exposing another group's data. Every group's first valid submission remains available to teacher review; the earliest valid complete request wins the question.

## Student status and final result

### `GET /api/activities/{activityId}/answer-status`

While live, return phase, question list, and only the caller's group submission state, own answer, and own receipt state. Never return other-group rows/status, answer count, question winner, leader identity, or global sequence.

This authenticated student route is for live status only. After end, use the public read-only final results route below; no group membership session is required for that route.

### `GET /api/activities/{activityId}/final-results`

No session header required. The `activityId` is the activity join code. Return results only when the activity is ended; while it is live, reject the request without revealing winner or submission information. Return one result per imported question. A winner includes group invite code and the winner's original answer; no valid submission returns `無有效作答／無勝組`. This route creates no student session and consumes no group seat. It grants read-only access; all mutation routes remain closed after end.

## Teacher live review

The authenticated owner may view all valid submissions, group invite code, receipt order, and winner flag while live. Validate ownership server-side. Do not reuse this projection for students.

## Guided Notes export preview and retry

Reuse existing preview/confirm/source verification. Winners populate mapped cells. No-winner rows are `略過` and leave source cells unchanged. After end, failed or uncertain writes expose a durable attempt ID and pending/failed/unknown state; retry reuses the persisted source snapshot, verifies the destination, and cannot reopen the activity or change results. Google credentials remain server-only.

## WebSocket events

- Teacher sockets may receive full live question/submission data with invite code and receipt order.
- Student sockets receive phase changes and their own group acknowledgment/status only. Never broadcast whether another group submitted, its answer, counts, leader, or global sequence.
- A student's last socket close starts the two-minute membership deadline; reconnect within the window restores the same session seat. REST snapshots remain authoritative.
- An owner's last socket close starts the separate two-minute teacher deadline; owner reconnect cancels it.

## Error conventions

Use existing error middleware. Validate role, activity membership/ownership, session expiration, invite-code shape and scope, group capacity, question/answer structure, and phase. Error responses are actionable and do not echo credentials, answers, session tokens, or cross-team data.
