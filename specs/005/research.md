# Research: 全狀態返回角色選擇

This is a retrospective design record based on the implementation on `codex/005`.

## Decisions

| Decision | Chosen behavior | Rationale / evidence |
|---|---|---|
| Retire the current session instead of deleting it | Clear only its `activity_id` and `group_id`, set `retired_at`, retain the row and role | Keeps session identity/history and foreign-key references valid while preventing it from being resumed. Implemented in `server/src/features/user-stage-sync/application/session-service.ts` and migration `005-user-stage-recovery.sql`. |
| Keep activity/group data | Do not delete or rename groups when a student returns to role selection | A group name remains reserved within its activity; this avoids silently changing classroom data. |
| Scope reset to one session | Teacher reset leaves activity phase/revision and student sessions untouched | Reset is a context transition for the requesting browser, not an activity lifecycle command. |
| Make retirement repeatable | Repeating reset on an existing retired session succeeds without changing retirement/update timestamps | Safe retry semantics for a user action where the first response may be lost. |
| Clear browser state after server result | Call reset first; clear local id only after success. Treat `SESSION_NOT_FOUND` as already absent; preserve state on other errors | Avoids losing the id needed to retry a failed retirement. Implemented by `retireBeforeClearingSession` in the client API helper. |
| Put control in shared shell | Render `ReturnToRoleControl` from `ApplicationShell` for all teacher/student flow views | One control covers all existing states without duplicating route-specific buttons. |
| Defer unavailable-activity recovery | Keep former `user-stage-sync` FR-014 outside this scope | User explicitly requested that unavailable-state handling wait for later work; it is not represented as implemented here. |

## Alternatives considered

- **Delete session row**: rejected because dependent records may refer to the session, and it removes the explicit retired state used by restore/operation guards.
- **Delete the student's group**: rejected because it removes shared activity data and permits reuse of the old name.
- **Clear browser storage before the API request**: rejected because a transient failure would strand the still-active server session and remove retry context.
- **Add return controls to every screen**: rejected because the shared application shell already spans the supported flow states.

## Evidence and limits

These decisions describe current code and tests. Activity-unavailable messaging/recovery, account authentication, teacher ownership transfer, and activity deletion are not covered by this feature.
