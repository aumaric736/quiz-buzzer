# Live Team Event Contract

This contract extends the existing authenticated activity WebSocket subscription. Event names and payloads are JSON and are represented in `@quiz-buzzer/shared` with discriminated TypeScript unions. Exact implementation field names may follow neighboring contract conventions, while preserving these audiences and guarantees.

## Subscription and recovery

- A subscription is authorized using the existing session and activity checks. The server derives the student's group from the stored session; a client cannot select another group in a subscription payload.
- Teacher subscription snapshot contains the teacher-visible roster, online and occupied counts, each group's join-open state, and each group's per-question submitted state and answer.
- Student subscription snapshot contains only that student's team, online member count, their role, and their team's question status and submitted answer.
- After reconnect, the client obtains an authoritative role-scoped snapshot before applying later deltas. Stale or duplicate revisions are ignored.

## Event families

### Teacher activity events

`activity.roster.updated`

- Audience: authenticated activity owner only.
- Payload: activity identifier, monotonic `activityLiveRevision`, and changed group roster records or an authoritative roster snapshot.
- Each group record includes group ID/name, online count, occupied count, capacity, and whether new members are accepted.

`activity.team-answer.updated`

- Audience: authenticated activity owner only.
- Payload: activity identifier, monotonic `activityLiveRevision`, group ID/name, question number, submitted status, and original answer parts.
- One event represents one team's answer change; it does not disclose a global answer sequence.

### Student team events

`team.presence.updated`

- Audience: current non-retired sessions whose stored `group_id` matches the affected group.
- Payload: activity/group identifiers, monotonic `groupLiveRevision`, online count, capacity, and the recipient's own role. Occupied count may be sent only if needed to explain a held seat and must not identify another member.

`team.answer.updated`

- Audience: current non-retired sessions whose stored `group_id` matches the affected group, plus the authenticated activity owner.
- Payload: activity/group identifiers, monotonic `groupLiveRevision`, question number, `submitted` status, and original answer parts.
- No student event contains another group's identity, answer, answered state, or a global receipt/order sequence.

## Ordering and delivery rules

- Persist the state transition before publishing its event.
- `activityLiveRevision` and `groupLiveRevision` increase monotonically in the same transaction as their corresponding persisted change. They are separate from the existing student-visible activity phase revision. Teacher events use `activityLiveRevision`; team events use `groupLiveRevision`.
- The client applies an event only when it is newer than the current revision. After reconnect it replaces stale local state with the authorized snapshot.
- A member disconnect event immediately reduces `onlineCount`; the seat remains occupied during the 2-minute restoration period. Expiry releases the seat, or closes new enrollment if the expired member was the leader.
- Events must reach authorized connected screens within 2 seconds at the 100-group/200-session capacity acceptance scenario.

## Error behavior

- Invalid, stale, retired, or unauthorized subscriptions are rejected with the existing safe error envelope; no roster or answer payload is sent.
- When the server reports that the student's grace period expired, the client clears the locally retained old session identity and returns to the new-member join flow. It must not retry the expired identity as if it were recoverable.
- Invalid event JSON is ignored/rejected using existing WebSocket validation conventions.
- Socket loss triggers existing reconnect and snapshot recovery; it does not itself retire the member until the 2-minute deadline.
