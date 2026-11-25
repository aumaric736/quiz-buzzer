# Data Model: 全狀態返回角色選擇

## UserSession

| Field | Meaning | Active state | Retired state |
|---|---|---|---|
| `id` | Local simulation session identifier | Used by browser to address the session | Retained as historical identity |
| `role` | `teacher` or `student` | Drives the selected flow | Retained; a new role selection creates a new session |
| `activity_id` | Associated activity, nullable | May identify the current activity | Set to `NULL` by reset |
| `group_id` | Associated group, nullable | May identify the student's group | Set to `NULL` by reset |
| `updated_at` | Last session update | Updated on state changes | Set when first retired; unchanged by repeat retirement |
| `retired_at` | Retirement timestamp, nullable | `NULL` | Set on retirement; non-NULL marks the session unusable |

The migration adds `retired_at`. Retirement is a transactional transition of one session. An already-retired row is idempotently accepted; a missing row is reported as `SESSION_NOT_FOUND`.

## Related records (retained)

- **Activity**: owns phase/revision and its groups. Returning a role does not alter or delete it.
- **Group**: belongs to an activity; its row and name remain after a student retires their session. Existing uniqueness rules continue to prevent reuse within that activity.

## Invariants

1. A retired session cannot be restored or used for activity-related operations.
2. Retiring a session does not mutate any other session.
3. Retiring a teacher does not change activity phase/revision or student sessions.
4. Retiring a student clears only that session's activity/group references; group data remains.
5. Selecting a role after returning creates a new active session with no inherited activity/group context.
