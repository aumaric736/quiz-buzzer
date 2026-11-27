# Data Model: 小組即時狀態與回寫

This feature extends the current activity, group, session, answer, and export-attempt records. It does not create a separate identity or persistence subsystem.

## Activity live state

| Field | Meaning | Rules |
|---|---|---|
| `activityId` | Parent activity identifier | All groups and answers belong to one activity. |
| `activityLiveRevision` | Teacher activity-state revision stored in `activities.live_revision` | Monotonically increases for teacher-visible roster and answer changes; used to reject stale events and recover snapshots. Teacher-only; separate from the existing student-visible phase revision. |
| `phase` | Existing activity phase | Only authorized sessions for the activity can subscribe while activity state is available. |

## Group and member presence

| Field | Meaning | Rules |
|---|---|---|
| `groupId` | Team identity | Unique within the existing activity model. |
| `displayName` | Teacher/student-facing team name | Used in the sheet writeback text. |
| `acceptsMembers` | Whether a new member session can join | False after leader departure/expiry; existing valid member sessions remain usable. |
| `groupLiveRevision` | Group-state revision stored in `groups.live_revision` | Increases for this group's membership, presence, and answer changes; visible only to this team's sessions and the teacher. |
| `capacity` | Maximum team sessions | Fixed at 2; includes the leader session. |
| `onlineCount` | Currently connected member sessions | Range 0–2. A disconnected session is excluded immediately. |
| `occupiedCount` | Sessions retaining a seat | Includes a disconnected, non-retired session until its 2-minute grace period expires. Used for join capacity only, not the online display. |
| `sessionId` | One member's session identity | Retired/expired session IDs cannot restore or subscribe. A new join creates a new session identity. |
| `groupRole` | `leader` or `member` | A leader expiry closes group enrollment; member expiry releases only that seat. |
| `disconnectedUntil` | End of recovery grace period | Set on unexpected disconnect; cleared on successful recovery; at deadline the session is retired and group/activity references are cleared. |

The `onlineCount` and `occupiedCount` are derived from current session presence, role, and retirement fields; they are distinct values even though the group capacity is the same.

## Team answer state

| Field | Meaning | Rules |
|---|---|---|
| `activityId`, `groupId`, `questionNumber` | Answer key | One group's answer state for one activity question. |
| `status` | `unanswered` or `submitted` | Changes to submitted only after a valid first submission is stored. |
| `answerParts` | Original submitted text parts | Preserve submitted text; readable by the submitting group and teacher only during the activity. |
| `groupLiveRevision` | Revision copied from the associated group into an event/snapshot | Uses the group's single live revision counter; it is not a separate answer counter and does not reveal another group's submissions or global order. |

## Guided Notes writeback preview

| Field | Meaning | Rules |
|---|---|---|
| `previewId` | One preview attempt identifier | Existing unique ID; confirmation is bound to the teacher and activity. |
| `createdAt`, `expiresAt` | Preview validity window | Five minutes from successful creation. Expired attempts cannot be confirmed; a new preview receives a new ID and deadline. |
| `answerSnapshotHash` | Answer state captured at preview time | Confirmation requires the current answer snapshot to match; otherwise regenerate. |
| `targets[]` | All mapped target cells | Confirmation re-reads every target and validates the complete set before any write. |
| `target.cell` | Current entered value and formula presence | A target is blank only when it has no formula and its entered scalar content is empty after trimming leading/trailing whitespace. Full-width spaces, tabs, and line breaks trim as whitespace. Formula cells are occupied even when their computed display is empty. |
| `target.proposedValue` | Previewed value | For a winning answer part, exactly `小組：{winningGroupName}。回答：{answerPart}。`; no-winner targets remain unchanged. |
| `target.label` | Human-readable cell/question label | Include every occupied target in the rejection response so the teacher can clear all required cells. |
| `status` | Existing export attempt lifecycle | `previewed`, `pending`, `completed`, `failed`, or `unknown`; expiry/regeneration does not mutate an old attempt into a valid one. |

## State transitions

### Member presence

```text
online -> disconnected (seat remains occupied; online count decreases)
disconnected -> online (before deadline; original session restored)
disconnected -> retired (at/after deadline; old identity cleared and seat released)
```

When a leader transitions to retired, also set the group's `acceptsMembers` to false. A member transition to retired does not close the group.

### Preview and confirmation

```text
previewed (before deadline) -> pending -> completed
                                       -> failed
                                       -> unknown (outcome could not be verified)
previewed (at/after deadline) -> confirmation denied; create a new preview attempt
```

Before `previewed -> pending`, validate preview expiry, answer snapshot, source mapping, and every target cell. If any target is occupied, reject the complete operation without writing any target.
