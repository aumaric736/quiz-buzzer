# Data Model: Session Flow Refinements

This feature uses existing persistent entities. No schema migration is expected.

## Activity

Existing activity record controlling whether a group may accept students and which teacher action is available.

- `id`: activity identifier.
- `phase`: `準備中`, `搶答進行中`, or `已結束`.
- `joining_opened_at`: null until the teacher opens joining.
- `live_revision`: increases when a change affecting the live teacher roster is committed.
- **Rules**:
  - Before joining opens: show both 「開始加入」 and 「開始答題」; enable only 「開始加入」.
  - `準備中` with `joining_opened_at`: keep both buttons visible; enable only 「開始答題」.
  - `搶答進行中` and `已結束`: keep both buttons visible and disabled; preserve the existing end-activity control while answering.
  - Joining and leader promotion are governed by current activity-stage rules; leader promotion applies only during `準備中`.

## Group

Existing group record with a maximum of two online student seats.

- `id`, `activity_id`, `display_name`, `invite_code`: group identity and join information.
- `leader_session_id`: reference to the current leader session.
- `accepts_members`: whether a group can receive new members, additionally constrained by activity stage and capacity.
- `live_revision`: increases when group presence or leadership changes.
- **Rules**:
  - At most two online students occupy capacity seats; disconnected, non-retired sessions remain associated for recovery but do not consume online seats.
  - `onlineCount` is bounded by `capacity`; `occupiedCount` counts linked, non-retired sessions and may temporarily exceed online capacity while offline sessions await recovery.
  - If a disconnected student returns when two other students have filled both seats, existing recovery behavior requires reassignment.
  - A leader departure during formation leaves `accepts_members` unchanged; online capacity and activity stage govern new joins.
  - The group has one current leader while an eligible online member exists; otherwise it may have no online leader.
  - If a student joins an empty team with no current leader, that student becomes leader.

## User Session (student)

Existing student session with team membership, role, and presence state.

- `id`: session identifier.
- `activity_id`, `group_id`: current activity and group membership.
- `group_role`: `leader` or `member`; updated atomically during handoff.
- `disconnected_at`: null while online; set when the session is classified offline.
- `retired_at`: set after an explicit return/reset removes the session from the active roster.
- **Rules**:
  - No heartbeat for 30 consecutive seconds classifies the session offline; 29,999 milliseconds remains online and 30,000 milliseconds is offline. Explicit return classifies/removes it immediately.
  - During team formation, a departing leader with one remaining online member yields leadership to that member.
  - The former leader is demoted before a heartbeat-timeout recovery can restore it, so it cannot reclaim leadership automatically.
  - After explicit return, the departing leader is detached; after timeout, it remains attached as an offline member subject to current reconnection/capacity rules.

## Live Presence Views

- **Teacher roster group**: current online count, join status, and current leader online status; revisioned by activity.
- **Student team snapshot**: recipient's current `groupRole`, online/occupied counts, capacity, and `acceptsMembers`; revisioned by group.
- **Consistency**: increment each affected group/activity live revision once per committed departure transition; publish only after transaction commit. Clients apply only revisions newer than their current snapshot.
