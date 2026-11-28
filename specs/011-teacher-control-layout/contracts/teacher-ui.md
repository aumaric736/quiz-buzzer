# Teacher UI Contract: Teacher Control Layout

## Team roster

- Omit the leader online/offline label for every team, regardless of leader presence.
- Keep the existing group name/invite code, online count, join status, and answer summary.
- Allocate the available row width in a 2:1:1 ratio to the existing group name/code, online-count, and join-status columns, respectively.
- Do not add replacement information, fields, badges, or controls.
- Keep the answer summary on the next row in its existing layout; it is outside the 2:1:1 column width ratio.

## Activity controls

| Activity state | Required visible controls | Placement and availability |
|---|---|---|
| Preparation before answering | 「開始加入」 and 「開始答題」 | Preserve the existing pre-answer positions. 「開始加入」 is available before joining opens; 「開始答題」 is available after joining opens. |
| Answering | 「結束答題」 | Hide both start controls. Show the end control in the former 「開始加入」 position. Disable it while its request is pending. |
| Ended | 「結束答題」 | Keep it visible at the former 「開始加入」 position and make it unavailable. |

The existing activity phase transition remains authoritative: starting answering transitions the activity to its answering phase; ending answering transitions it to its ended phase. A failed transition continues to use the existing error path and must not display a successful ended state.

## Accessibility and interaction

- Hidden controls must not remain keyboard-focusable.
- An unavailable 「結束答題」 control remains visibly disabled and cannot trigger another phase change.
- Keep the existing button labels and language consistent with the feature specification.

## Per-question answering progress

- Preserve the existing question order, progress counts, and question selection behavior.
- Display no more than four question tiles per row using four equal slots; each tile occupies exactly 25% of the available row width.
- Place additional questions in the next row. Leave unused quarter-width slots in an incomplete final row blank; do not widen or stretch the remaining tiles.
- Retain the existing empty-state message when there are no questions to display.
