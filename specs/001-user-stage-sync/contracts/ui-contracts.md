# UI Contracts: 使用者角色與活動階段同步

These user-facing contracts derive from
`../../../diagrams/001-user-stage-sync-component.puml` and
`../../../diagrams/001-user-stage-sync-sequence.puml`. They define observable behavior,
not framework-specific components or network endpoints.

## Role Selection

- The local simulation offers `老師` and `學生` roles.
- Selecting a role does not create an account or claim real identity.
- Invalid or missing role input is rejected with a clear prompt to select one
  of the supported roles.
- After selecting a role, the user can return to role selection from every
  subsequent teacher or student flow, regardless of activity or phase state.
- Returning retires the current session and clears its activity/group
  associations before showing role selection. Group records and reserved names
  remain; a new role choice starts with a fresh session and no inherited
  context.
- If session reset fails, keep the user in the current flow, explain the error,
  and allow retry. Do not show role selection as though the old session was
  cleared.
- If a teacher returns while students are using the activity, retire only the
  teacher's session. Leave the activity phase and student sessions unchanged;
  do not end the activity or transfer its control.

## Teacher Activity Flow

- A teacher can create an activity; success opens it in `準備中`.
- The teacher can start a `準備中` activity and end a `搶答進行中` activity.
- The teacher cannot skip, reverse, or reopen a phase. A rejected action leaves
  the activity unchanged and explains the allowed next action.
- A successful phase change is persisted before connected views are notified.

## Student Group Enrollment

- A student selects an activity and provides a non-empty group name.
- Enrollment succeeds only while the activity is `準備中`.
- Group names are trimmed for display and compared after trimming and English
  case-folding. Duplicate names within the same activity are rejected with a
  specific message; the same name may be used in another activity.
- After the activity starts or ends, joining is rejected with a message that
  enrollment is closed.

## Connected Views and Recovery

- Every connected teacher and student view of an activity displays the same
  current phase after a successful teacher transition.
- A view that refreshes or reconnects restores its role and activity context,
  then displays the latest saved phase. A stale cached phase is never written
  over the saved phase during restoration.
- The unavailable-activity recovery message and action in FR-014 are deferred
  outside `codex/005`.
- Activating the button clears the current session's activity/group references
  and retires that session through the local service, preserves the activity,
  group row, and reserved name, and clears the old browser session id before
  showing role selection. A new role choice creates a fresh session with no
  inherited role, activity, or group context.
- Retired sessions cannot be restored or used for activity operations; the
  retained role value is historical and is not an active selection.
- If the session itself no longer exists, discard its invalid browser id and
  return to role selection. If the service cannot clear an existing session's
  context, explain the failure and allow the user to retry.

## Answer-Status Visibility

- Before `已結束`, a student receives no other group's answer status through
  any supported student view path.
- After `已結束`, students may view other groups' status.
- A student attempting to answer during `準備中` receives an “activity has not
  started” error; attempting after `已結束` receives an “activity has ended”
  error from the answer-attempt check. During `搶答進行中`, the check reports
  that the student may enter the answer flow. The check does not accept or save
  answer content; answer entry and submission are outside this subfeature.

## Error Feedback

All rejected actions preserve the last valid activity state and provide a
plain-language reason. Messages must not expose secrets or internal storage
details.
