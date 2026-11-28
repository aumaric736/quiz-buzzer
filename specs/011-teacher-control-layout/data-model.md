# Data Model: Teacher Control Layout

## Scope

This feature introduces no persistent entities, fields, relationships, or API payload changes. It changes only the teacher-facing presentation of existing activity and group information.

## Existing view data

| View data | Existing source | Feature behavior |
|---|---|---|
| Activity phase | Existing `ActivitySnapshot.phase` | Determines whether preparation controls or the answering/ended control is shown. |
| Joining-open state | Existing `ActivitySnapshot.joiningOpenedAt` | Continues to determine whether 「開始加入」 or 「開始答題」 is available during preparation. |
| Busy state | Existing teacher view operation state | Keeps the action in flight unavailable while the phase change is pending. |
| Group online count | Existing teacher roster item/live roster record | Remains visible. |
| Leader online state | Existing teacher roster item/live roster record | Is not displayed in the teacher roster. No data deletion is implied. |
| Join status | Existing teacher roster item/live roster record | Remains visible beside the online count. |
| Question progress list | Existing ordered `TeacherQuestionProgress[]` | Display order and progress values remain unchanged; presentation assigns each item to one of four equal slots per row. |

## Control display states

| Activity state | 「開始加入」 | 「開始答題」 | 「結束答題」 |
|---|---|---|---|
| Preparation, joining not opened | Visible; enabled when not busy | Visible; disabled | Not shown |
| Preparation, joining opened | Visible; disabled | Visible; enabled when not busy | Not shown |
| Answering | Hidden | Hidden | Visible at former 「開始加入」 position; enabled when not busy |
| Ended | Hidden | Hidden | Visible at former 「開始加入」 position; unavailable |

The pre-answer control layout must follow the specification and UI contract. The implementation must not introduce any new domain state to support display behavior.

## Question progress layout

- The ordered question progress items are presented in groups of four per row.
- Each occupied or unoccupied slot is one quarter of the available row width; unused slots at the end of the final row stay blank.
- This is derived presentation only. It does not change the question progress data, worksheet order, or persistence model.
