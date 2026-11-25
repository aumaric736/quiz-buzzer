# API and WebSocket Contracts: 使用者角色與活動階段同步

These local-service contracts implement the boundaries in the component and
sequence diagrams. The Express service listens only on `127.0.0.1`; it is not a
cross-device API. Request/response types are shared TypeScript contracts.

## Common Rules

- JSON request bodies are validated for type, required fields, allowed enum
  values, and reasonable length before domain operations run.
- Errors use `{ "code": "STABLE_CODE", "message": "Clear user-facing reason" }`.
  Error responses and logs omit secrets, auth headers, environment values,
  private keys, and raw request bodies.
- The browser sends the simulated local session id in `X-Local-Session-Id` for
  activity operations. This preserves the selected role; it is not authentication.
- Only the configured loopback client origin is allowed by the development CORS
  policy.

## HTTP API

### `POST /api/sessions`

Creates a local simulated session.

Request: `{ "role": "teacher" | "student" }`

Response `201`: `{ "sessionId": string, "role": "teacher" | "student" }`

Invalid or missing roles return `400 INVALID_ROLE`.
New sessions are active and have no activity or group context.

### `GET /api/sessions/{sessionId}`

Returns the persisted local role/activity/group context for refresh recovery.

Response `200`: `{ "sessionId": string, "role": "teacher" | "student", "activityId": string | null, "groupId": string | null, "groupName": string | null }`; `groupName` is derived from the saved group row for display during refresh recovery.

Missing or retired sessions return `404 SESSION_NOT_FOUND`; a retired session's role is not restored.

### `POST /api/sessions/{sessionId}/reset-context`

Clears the selected session's `activityId` and `groupId` references after the
user chooses to return to role selection, and retires the session. It applies
to any active teacher or student session regardless of activity, phase, or
enrollment state. It modifies only the addressed session and does not change
the activity phase or any other session. The operation is transactional and
does not delete the activity/group rows or release the activity-scoped group
name. The browser removes the old local
session id after a successful reset; the next role choice creates a new active
session. A repeated reset of an already-retired session succeeds idempotently.

Response `200`: `{ "sessionId": string, "status": "retired", "activityId": null, "groupId": null }`

Missing sessions return `404 SESSION_NOT_FOUND`; the client may discard that
already-invalid local id and return to role selection. If the service cannot
complete the reset, the client keeps the current flow available for retry and
does not silently claim the old context was cleared.

### `POST /api/activities`

Creates an activity. Requires a local session with role `teacher`.

Request: `{}`

Response `201`: `{ "activityId": string, "phase": "準備中", "revision": 0 }`

The service also updates the teacher session's `activityId` in the same
transaction so the activity context can be restored after refresh.

### `GET /api/activities/{activityId}`

Returns the current saved activity snapshot for view initialization and
reconnect recovery.

Response `200`: `{ "activityId": string, "phase": ActivityPhase, "revision": number }`

Missing activities return `404 ACTIVITY_NOT_FOUND`. The future FR-014
`ACTIVITY_UNAVAILABLE` response and unavailable-activity guards are deferred
outside `codex/005`.

### `POST /api/activities/{activityId}/groups`

Enrolls a student group. Requires a local session with role `student`.

Request: `{ "groupName": string }`

Response `201`: `{ "groupId": string, "displayName": string, "activityId": string }`

Blank names return `400 INVALID_GROUP_NAME`; duplicate normalized names return
`409 GROUP_NAME_TAKEN`; enrollment after preparation returns
`409 ENROLLMENT_CLOSED`. Handling an unavailable activity
(`404 ACTIVITY_UNAVAILABLE`) is deferred to the future FR-014 implementation.

Successful enrollment updates the student session's `activityId` and `groupId`
in the same transaction as the group insert. Rejected enrollment leaves the
session context unchanged.

### `POST /api/activities/{activityId}/phase`

Changes phase. Requires a local session with role `teacher`.

Request: `{ "phase": "搶答進行中" | "已結束" }`

Response `200`: `{ "activityId": string, "phase": ActivityPhase, "revision": number }`

Invalid transitions return `409 INVALID_PHASE_TRANSITION`; the saved phase does
not change. Rejection for unavailable activities under FR-014 is deferred
outside `codex/005`.

### `POST /api/activities/{activityId}/answer-attempt-check`

Checks only whether the current phase permits a student to enter the answer
flow. It accepts no answer content and never submits or saves an answer.

Request: empty body. Requires a local session with role `student`.

- During `準備中`, return `409 ANSWER_NOT_STARTED` with a clear not-started
  message.
- During `搶答進行中`, return `200 { "allowed": true }`.
- During `已結束`, return `409 ANSWER_ACTIVITY_ENDED` with a clear ended message.

### `GET /api/activities/{activityId}/answer-status`

Applies the access rule in the component diagram. Before `已結束`, return
`403 ANSWER_STATUS_HIDDEN` without including answer-status data. After `已結束`,
return `200 { "items": [] }` until the future answer-status feature supplies
records; no answer data is created or stored by this subfeature.

## WebSocket Contract

Connect to `ws://127.0.0.1:{PORT}/ws`. Immediately send a validated subscription
message:

```json
{
  "type": "activity.subscribe",
  "activityId": "opaque-id",
  "sessionId": "local-session-id"
}
```

For each committed phase change, send subscribed views:

```json
{
  "type": "activity.phase.updated",
  "activityId": "opaque-id",
  "phase": "搶答進行中",
  "revision": 1
}
```

The server broadcasts only after the SQLite transaction commits. Clients ignore
an event with a revision less than or equal to the currently displayed revision.
On reconnect, the client must call `GET /api/activities/{activityId}` to recover
the authoritative phase. Malformed messages receive a generic protocol error;
the server does not echo submitted credentials or raw payloads.

After an authorized subscription, the server sends
`{ "type": "activity.subscribed", "activityId": string, "phase": ActivityPhase, "revision": number }`.
The teacher must be the activity creator; a student must already be enrolled in
the activity. Retired sessions are denied with a sanitized protocol error and
are not added to the subscriber list. Unavailable-activity subscription denial
is part of future FR-014 work and is deferred outside `codex/005`.

## Out of Scope

No Google Sheets endpoint, OAuth callback, external credential, answer-content
submission/storage endpoint, or cross-device listener is defined in this
subfeature.
