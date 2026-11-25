# Data Model: 使用者角色與活動階段同步

This model follows `../../diagrams/001-user-stage-sync-class.puml`. SQLite in the
local Node service is authoritative. Identifiers are opaque text ids. Persisted
role/session context supports refresh recovery but is not authentication.

## Entities

### UserSession (`user_sessions`)

Represents the selected simulated role and current activity context, not an
authenticated account.

| Field | Required | Validation / meaning |
|---|---|---|
| `id` | Yes | Stable opaque local session id. |
| `role` | Yes | `teacher` or `student`; reject all other values. |
| `activityId` | No | Activity currently open in this session. |
| `groupId` | No | Student's joined group; required for a student enrolled in an activity and absent for a teacher. |
| `updatedAt` | Yes | Last session-context update. |
| `retiredAt` | No | Timestamp when this context was retired; retired sessions cannot be restored or used for activity operations. The role remains historical data only. |

The browser retains the local session id across refresh. The id restores a
simulation context; it is not a secret or authorization token.

When a user chooses to return to role selection from any post-role-selection
flow, the local service atomically clears that session's
`activityId` and `groupId`, sets `retiredAt`, and updates `updatedAt`. The client
then removes the old session id from browser storage; choosing a role creates a
fresh active session. Retired sessions cannot be restored, while the old role
value remains historical data only. The reset does not delete the `Activity` or
`Group` rows, so the group name remains reserved within its activity. Permanent
data purge is outside this feature.

When the retiring session belongs to a teacher, the reset affects only that
teacher session. The activity phase and all other student sessions remain
unchanged; the activity is not automatically ended and its control is not
transferred to another session.

### Activity (`activities`)

Represents a teacher-created classroom activity.

| Field | Required | Validation / meaning |
|---|---|---|
| `id` | Yes | Unique activity id. |
| `phase` | Yes | `準備中`, `搶答進行中`, or `已結束`; new activities start in `準備中`. |
| `revision` | Yes | Monotonically increasing integer updated in the same transaction as a phase change. |
| `createdBySessionId` | Yes | Simulated teacher session that created the activity. |
| `createdAt` | Yes | Creation timestamp. |
| `updatedAt` | Yes | Last activity update timestamp. |
| `unavailableAt` | Future FR-014 | Not implemented in `codex/005`; unavailable-activity state and recovery are deferred to a later feature. |

### Group (`groups`)

Represents one student team enrolled in an activity.

| Field | Required | Validation / meaning |
|---|---|---|
| `id` | Yes | Unique group id. |
| `activityId` | Yes | Existing activity accepting enrollment. |
| `displayName` | Yes | Original name with surrounding whitespace removed; cannot be empty. |
| `normalizedName` | Yes | Trimmed name with English letters case-folded for uniqueness comparison. |
| `joinedAt` | Yes | Enrollment timestamp. |

**Uniqueness**: `(activityId, normalizedName)` is a SQLite unique constraint.
Enrollment checks that the role is student and activity is `準備中`, then
inserts the group in one transaction. A constraint collision returns a clear
duplicate-name error without changing activity state.

### AnswerStatus (future feature data)

Capturing and storing answers is outside this subfeature. The answer-status
access boundary from the component diagram must require `activity.phase` to be
`已結束` before returning another group's status to a student. No answer-status
table or Sheets mapping is introduced by this plan.

## Relationships

- One activity contains zero or more groups.
- One group belongs to exactly one activity; later answer-submission work may
  associate answer statuses with the group and activity.
- One user session has one role and may reference one current activity;
  enrolled student sessions also reference their group.
- A retired user session is inactive and cannot restore its role/activity/group
  context; a newly selected role receives a new active session.
- On refresh, the session API derives the student's `groupName` from the linked
  group row for display; the name is not duplicated in the session table.
- Creating an activity stores its id on the creating teacher session. Successful
  group enrollment stores the activity and group ids on the student session in
  the same transaction; rejected operations do not change the session context.
- Activity, group, and session rows persist in SQLite so refresh/reconnect can
  reload the latest activity phase.
- Returning to role selection clears the old session's activity/group
  references and retires the old session without deleting the activity or group
  rows. A newly selected role starts a fresh session and does not inherit the old
  session context.
- Retiring a teacher session leaves the activity phase and other student session
  records unchanged; no activity end or control transfer occurs as a side effect.

## Future Scope: Activity Availability Lifecycle (FR-014)

This lifecycle is specified for a later feature and is not implemented by
`codex/005`.

| Availability | Restore/join/phase behavior | Data behavior |
|---|---|---|
| Available | Normal phase and enrollment rules apply. | Activity and groups remain stored. |
| Unavailable | Restore, group enrollment, and phase changes are rejected with a clear unavailable-activity response. | The activity and group records remain stored; group-name uniqueness remains reserved. |

## Activity Phase Lifecycle

| Current phase | Requested phase | Result |
|---|---|---|
| `準備中` | `搶答進行中` | Accept for simulated teacher; update phase and revision in one transaction. |
| `搶答進行中` | `已結束` | Accept for simulated teacher; update phase and revision in one transaction. |
| Any phase | Same, skipped, backward, blank, or unknown phase | Reject with a clear message; stored phase remains unchanged. |
| `已結束` | Any other phase | Reject; ended is terminal. |

After commit, publish `activity.phase.updated` with `activityId`, `phase`, and
`revision`. Connected clients apply only a revision newer than their current
view. On subscribe or reconnect, the client fetches the current activity from
the REST API and treats that persisted result as authoritative.

## Local Security Boundary

Teacher/student roles are selected in the UI because account registration is
out of scope. Server-side role checks preserve the product rules in this local
simulation; they are not an authentication boundary against a user who can
control the local machine or modify the local client.

## Answer Phase Guard

The local answer-attempt-check operation requires the student role and reads the
current activity phase. It denies `準備中` and `已結束` with phase-specific
errors, and returns `allowed: true` only for `搶答進行中`. It accepts no answer
content and creates no answer record; answer entry, submission, storage, and
scoring are deferred to a later subfeature.
