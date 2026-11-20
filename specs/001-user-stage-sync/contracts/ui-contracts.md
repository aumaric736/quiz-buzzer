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
- If the saved activity no longer exists, show a clear recovery error and a way
  back to activity selection.

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
