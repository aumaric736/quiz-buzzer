# API Contract: 全狀態返回角色選擇

Base path: `/api`. JSON responses use the existing user-stage-sync API envelope.

## Retire session context

`POST /api/sessions/{sessionId}/reset-context`

Retires the addressed session. The service transaction clears its activity/group references and sets retirement/update timestamps. It retains the session row, role, activity, group, and group name.

| Result | Behavior |
|---|---|
| Existing active session | Success; session becomes retired and context references are null |
| Existing retired session | Success; idempotent; retirement/update timestamps do not change |
| Unknown session id | `404`, code `SESSION_NOT_FOUND` |

No activity-wide side effect is permitted. In particular this operation does not end an activity or alter phase/revision, other sessions, groups, or group-name uniqueness.

## Retired session access

Session restore and operations requiring an active session reject a retired session with the existing `404 SESSION_NOT_FOUND` behavior. This includes activity/group, question/answer/review, guided-notes, and websocket-related paths guarded by the feature.

## Role selection

After local return succeeds, the existing role selection and session creation flows are used. Creating a new session does not restore or reuse the retired session's activity/group context.

## Out of scope

This contract does not specify or implement recovery for an unavailable activity (former FR-014).
