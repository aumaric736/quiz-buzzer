# Live Presence Events Contract

No new route or event type is required. Extend existing shared WebSocket event payloads while retaining their revision and authorization rules.

## Teacher roster: `activity.roster.updated`

Each group record continues to include `groupId`, `displayName`, `inviteCode`, `onlineCount`, `joinStatus`, and answers. Add:

- `leaderOnline: boolean`: whether the session referenced by the group's current `leader_session_id` is online.

The event's `activityLiveRevision` must advance after leader presence or leadership changes. The teacher view uses this field with the online count and join status to reflect the current team state.

Each affected group and activity revision increases exactly once for one committed departure transition, even when the same transaction changes presence and leadership.

## Team snapshot: `team.presence.updated`

Retain `groupRole`, `onlineCount`, `occupiedCount`, `capacity`, `acceptsMembers`, answers, and `groupLiveRevision`. When the remaining member is promoted, that member's next snapshot has `groupRole: "leader"`; an online former leader has `groupRole: "member"` after returning from a heartbeat timeout.

`onlineCount` MUST NOT exceed `capacity` (2). `occupiedCount` includes linked, non-retired offline sessions retained for recovery and may exceed `capacity` until those sessions recover or are reassigned.

## Delivery and validation

- Publish the teacher roster and current team snapshots only after the state transaction commits.
- Increment the relevant live revisions in the same state transition.
- Count no more than two online students toward team capacity; an offline non-retired session may remain linked for recovery without occupying a seat.
- Continue validating event shape, activity/group identity, participant authorization, and monotonically increasing revisions in the client socket service.
- Connected screens should reflect detected leader timeout or explicit return within the feature's 5-second bound.
