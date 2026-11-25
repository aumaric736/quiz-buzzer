# UI Contract: 全狀態返回角色選擇

## Visibility and action

- `ReturnToRoleControl` is hosted by `ApplicationShell`, which wraps all teacher and student flow views. It is available after a role/session has been selected, including activity setup, group entry, and later activity states.
- Activating it requests retirement of the currently stored session before returning to role selection.

## State transitions

| Outcome | Required visible/local behavior |
|---|---|
| Reset succeeds | Clear old local session id, then show the role chooser |
| Server reports `SESSION_NOT_FOUND` | Clear the stale id and show the role chooser |
| Other API/network failure | Keep current flow and id; display an actionable error and allow retry |
| No stored session id | Return directly to role selection without a reset request |

The same flow applies to teacher and student. A subsequent selection creates a new session. There is no activity-unavailable recovery UI in this feature.
