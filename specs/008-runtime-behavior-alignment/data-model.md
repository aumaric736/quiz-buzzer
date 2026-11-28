# Data Model: 小組加入、即時作答檢視與學習單匯入

This feature extends the existing activity, team, student session, worksheet question/mapping, answer, and result records. It does not add an activity phase, identity system, or result subsystem.

## Activity and question set

| Attribute | Meaning | Rules |
|---|---|---|
| `activityId` | Existing activity identity | Owns groups, imported questions, sessions, answers, and live revisions. |
| `phase` | `準備中`, `搶答進行中`, or `已結束` | Existing lifecycle source of truth; no new phase is introduced. |
| `joiningOpenedAt` | Nullable persisted timestamp for teacher action `開放加入` | Null means students cannot join and teacher may edit/import the question set; set once, only in `準備中`, after question readiness is confirmed. This action atomically freezes the question set and opens team enrollment. |
| `activityLiveRevision` | Teacher-visible state ordering | Advances with committed activity-wide roster, answer-progress, and join-open changes. |
| `questionSet` | Imported worksheet questions and mappings | Complete set is committed atomically; can be replaced before `joiningOpenedAt` is set; immutable after opening. |

### Imported question

| Attribute | Meaning | Rules |
|---|---|---|
| `questionId` | Existing internal activity-question row id | Keep as the row identity; answer and mapping records continue to reference the existing `(activityId, sourceQuestionNumber)` business key. |
| `sourceQuestionNumber` | Original worksheet number (`question_number`) | Preserve it as displayed; unique within the imported worksheet; gaps are permitted. A missing number on a question-structured row or duplicate rejects the complete import. Existing answer and mapping records continue to use it as their business key. |
| `displayOrder` | Persisted document ordinal (`display_order`) | Store contiguous zero-based order from the recognized worksheet and use it for question-list, progress, and result presentation independently of the source number. Migration 009 backfills existing rows by ascending source question number because the former document order was not stored. |
| `answerMappings[]` | Source answer-field mappings | At least one per question for readiness; mapping indexes start at zero and are contiguous, independent of source question number. |
| `sourceSheet`, `sourceRow` | Import diagnostic location | Retain enough location to identify worksheet and row in structural/numbering errors. |

### Worksheet import operation

| Attribute | Meaning | Rules |
|---|---|---|
| source structure | Headers and merged-cell layout | Recognize `題號`, `題目`, `作答` and supported merged-cell structure; use `題目` as a structural header without persisting prompt text; no user marker or fixed coordinate requirement. |
| recognized rows | Question, instruction, blank rows | Allow question-count changes, moved columns, instructions, and blank separators. Blank separators do not count as missing-number errors. |
| persisted question order | `display_order` on the activity question | Save recognized document order and use it for all ordered question lists; do not sort by `question_number`. |
| transaction outcome | Imported set or diagnostic rejection | Validate full selection, then save complete set/mappings or nothing. Ambiguous layouts and invalid numbering reject all. |
| edit eligibility | Join-open gate | Import/replacement/question-list editing is permitted only while `joiningOpenedAt` is null. Opening join and freezing the question set are committed together. Rejected edits leave the last complete set unchanged. |

## Student session and team membership

| Attribute | Meaning | Rules |
|---|---|---|
| `sessionId` | Student session identity | Remains recoverable during answering even when offline. |
| `activityId`, `groupId`, `groupRole` | Activity/team association and leader/member role | Independent of connection status. Restore same association/role when phase permits. |
| `disconnectedAt` | Nullable offline classification time | Null means online; set immediately for clean close or after 30 consecutive heartbeat-free seconds for unclean close. Does not expire reconnect eligibility. |
| retired state | Invalidated session | Must not be set solely because heartbeat timeout elapsed. Ended-phase denial is phase-based; existing results remain governed separately. |

## Group and teacher roster

| Attribute | Meaning | Rules |
|---|---|---|
| `groupId`, `displayName` | Existing group identity and name | Name length must not shift the aligned online-count column. |
| `onlineCount` | Currently connected members | Count leaders and members uniformly; team-formation capacity is at most two online members. |
| capacity | Internal enrollment validation | Not exposed as teacher-facing seat, occupied-member, or capacity data. |
| `joinState` | Unavailable, open, full, or stopped | Unavailable before `joiningOpenedAt`, before question readiness, or after end; open only while preparing after opening and with an online vacancy; full while open/preparing with two online members; stopped during answering regardless of vacancy. |
| `groupLiveRevision` | Team-scoped event ordering | Advances transactionally for team presence and answer changes. |

The teacher roster exposes only `onlineCount` and the derived `joinState`; `額滿` explains why a team cannot accept another member without exposing a seat or capacity number. When an online member leaves during team formation, the committed roster changes from `額滿` to `開放加入` if the team now has a vacancy.

## Answer progress and result

| Attribute | Meaning | Rules |
|---|---|---|
| `activityId`, `groupId`, `sourceQuestionNumber` | Answer key | Existing answer records use the source question number as identity; `displayOrder` controls presentation only and is never used as an answer or mapping key. |
| `answerParts` | Persisted submitted content | Visible to authorized teachers activity-wide; visible to students only for their own team while active. |
| `validSubmission` | Whether a submission counts | Only a saved valid first submission per team/question contributes to answered count and rank. Invalid/duplicate submissions do not. |
| `rank` | Current per-question position | Uses feature 004 effective receive/record order. Other first submissions after a winner get subsequent ranks and do not replace the winner. Question lists and final result displays follow `displayOrder`; ranking order remains accepted-submission order. |
| `answeredGroupCount`, `totalGroupCount` | Teacher question progress | Denominator is all current activity groups, including offline groups. |
| final result | Ended activity record | Rank is stable at end; access and presentation follow feature 004. No new summary metrics. |

## Lifecycle and state transitions

| State/event | Membership/import behavior | Teacher read model |
|---|---|---|
| `準備中`, questions absent/incomplete | Reject join and opening. Teacher may import/replace/edit; validate the whole sheet. | Join unavailable. |
| Migration 009, existing question rows | Backfill contiguous zero-based `displayOrder` in ascending source question number. Future imports save worksheet row order instead. | Existing activities retain their current numeric ordering; new imports preserve actual document order. |
| Migration 009, legacy `準備中` activity | Backfill `joiningOpenedAt` only when an assigned student membership and ready question/mapping set both exist. If no student is assigned or the set is incomplete, keep the marker null, preserve all existing membership, and allow the teacher to finish the set before opening. | Preserve an already valid team-formation state without locking an incomplete worksheet. |
| Migration 009, active legacy student session with `disconnected_until` | Backfill `disconnectedAt` from the session's `updated_at`; retain its activity/group/role association so online counts and recovery agree with the previously recorded disconnect. | The migrated session is offline and recoverable according to the current phase rules. |
| `準備中`, ready question set, `joiningOpenedAt` null | Teacher may continue editing or replacing the full set. Students cannot join. | Join unavailable until explicit teacher action. |
| Teacher opens joining | In one successful operation, validate question readiness, set `joiningOpenedAt`, freeze question changes, and allow team enrollment without changing `phase`. | Show open if a group has an online vacancy; show full at two online members; roster still returns online counts only. |
| `準備中`, joining open | Allow join while group has fewer than two online members. Clean close frees vacancy immediately; unclean close is classified after 30 seconds. Retain association for conditional recovery. Reject all question-set edits. | Show `開放加入` with a vacancy and `額滿` at two online members. |
| Team member reconnects during formation | Restore original identity/role only if original group has room; otherwise offer normal selection in another available group. | Publish committed roster/presence state. |
| `搶答進行中`, member disconnect/reconnect | Reject new join; preserve original membership and permit reconnect without deadline. | Always show stopped, even with offline members. |
| Valid first answer saved | Persist first valid team answer and rank under feature 004 order. | Render counts, answered/unanswered groups, answer, and rank within two seconds. |
| `已結束` | Reject join, reconnect, and answer; preserve saved data. | Authorized feature-004 read-only results remain available. |

## Consistency and authorization invariants

- Opening team enrollment and freezing the question set are one durable state change; imports/edit attempts after it cannot race a student join.
- Worksheet import is all-or-nothing. Errors leave the last committed question set and mappings untouched.
- Preserve worksheet order using persisted `displayOrder` and preserve source question numbers; gaps are valid. Mapping slot indexes remain zero-based and contiguous. Legacy rows use the specified migration backfill.
- The student team-formation UI remains as it is; do not add a question count or question-content preview.
- Derive online counts from connection state; enforce capacity server-side and omit capacity/occupied counts from teacher roster payloads.
- Teacher progress is activity-scoped and authorized; students do not receive other teams' active answer state/content/rank.
- Persist roster, presence, and answer changes before publishing revisions/events; authorized connected views render within two seconds after commit.
