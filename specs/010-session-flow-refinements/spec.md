# Feature Specification: Session Flow Refinements

**Feature Branch**: `codex/010`

**Created**: 2026-11-28

**Status**: Draft

**Input**: User description: 老師建立活動後只有「開放加入」選項；按下後按鈕改為「開始答題」，兩個不可並列顯示。組隊階段組長離線（超過 30 秒沒心跳或點擊返回按鈕）後，若小組內還有組員則升級為組長；取消組長離開後小組不可再有新同學加入的規定。組長也需要心跳偵測，超過時間即時更新組員跟老師的顯示畫面。

## Clarifications

### Session 2026-11-28

- Q: 組長離線後若有多位在線組員，應由哪一位接任組長？ → A: 每組只有兩人，組長離線後只會剩下一位組員，由該組員接任。
- Q: 老師按下「開始答題」後，這個按鈕應如何顯示？ → A: 按下後保留「開始答題」按鈕，但停用。
- Q: 「開始加入」和「開始答題」兩個按鈕應如何隨活動狀態改變？ → A: 兩個按鈕始終並列顯示；開始加入前只有「開始加入」可用，開始加入後只有「開始答題」可用，開始答題後兩個按鈕都停用。
- Q: 心跳逾時的 30 秒邊界如何判定？ → A: 連續 30 秒沒有心跳即判定離線；29,999 毫秒仍在線，30,000 毫秒離線。
- Q: 空小組再次有人加入時，新同學的組長角色如何處理？ → A: 小組沒有目前組長時，第一位新加入者成為組長。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Teacher advances an activity (Priority: P1)

As a teacher, I need one clear next action at each activity stage so that I can open team joining and then start answering without confusing or overlapping controls.

**Why this priority**: This is the primary teacher flow and prevents ambiguous stage transitions.

**Independent Test**: Create an activity and inspect the teacher controls before and after opening joining.

**Acceptance Scenarios**:

1. **Given** a newly created activity before joining opens, **When** the teacher views its controls, **Then** 「開始加入」 and 「開始答題」 are both visible, 「開始加入」 is enabled, and 「開始答題」 is disabled.
2. **Given** joining has been opened and the activity remains in preparation, **When** the teacher views its controls, **Then** both buttons remain visible, 「開始加入」 is disabled, and 「開始答題」 is enabled.
3. **Given** joining has been opened, **When** the teacher starts answering, **Then** the activity advances to the answering stage and both buttons remain visible but disabled.
4. **Given** the activity has ended, **When** the teacher views its controls, **Then** both stage buttons remain visible and disabled.

---

### User Story 2 - Team continues after leader departure (Priority: P1)

As a team member, I need the team to remain usable when its leader leaves so that I can continue without recreating the team.

**Why this priority**: A leader disconnect should not strand the remaining students or prevent team participation.

**Independent Test**: During the team formation stage, remove a leader by return action or by exceeding the 30-second heartbeat threshold, then inspect leader assignment and team join availability.

**Acceptance Scenarios**:

1. **Given** a team has a leader and at least one member, **When** the leader clicks the return action during team formation, **Then** an eligible remaining member is promoted to leader.
2. **Given** a team has a leader and at least one member, **When** the leader has no heartbeat for 30 consecutive seconds during team formation, **Then** the leader is treated as offline and an eligible remaining member is promoted to leader.
3. **Given** a leader leaves but members remain, **When** another student attempts to join, **Then** the student may join subject to the existing team capacity and joining-stage rules.
4. **Given** the leader leaves and no members remain, **When** the team state is updated, **Then** no promotion occurs and the empty team is handled as available for joining according to existing joining rules.
5. **Given** an empty team has no current leader and its activity is open for joining, **When** the first student joins it, **Then** that student becomes its leader.

---

### User Story 3 - Participants see leader presence changes (Priority: P2)

As a teacher or student, I need to see leader disconnections and handoffs promptly so that displayed team leadership reflects who is currently present.

**Why this priority**: Consistent presence information lets teachers and students act on the same current team state.

**Independent Test**: Allow a leader heartbeat to expire and verify that both teacher and team member views update within the stated bound.

**Acceptance Scenarios**:

1. **Given** the leader stops sending heartbeats for 30 consecutive seconds, **When** the offline threshold is reached, **Then** the teacher and team member views show the leader as offline and show the promoted leader when one exists within 5 seconds.
2. **Given** the leader leaves using the return action, **When** leadership is reassigned, **Then** teacher and team member views reflect the new leader within 5 seconds.

### Edge Cases

- Each team has at most two online student seats; when its leader leaves, at most one member remains and that member is promoted if online.
- A disconnected, non-retired student session remains associated for recovery but does not occupy an online seat; if both seats are filled when it reconnects, the existing recovery flow requires reassignment.
- If all members are offline or have left, there is no successor; the team becomes joinable again only when the activity is still in the joining stage.
- When a student joins an empty team with no current leader, that student becomes the leader.
- A leader heartbeat arriving after a new leader has already been assigned does not reclaim leadership automatically.
- A member's heartbeat timeout follows the same 30-second offline definition as the leader.
- On the transition from joining to answering, leader departure does not enable new joining because the activity is no longer in the joining stage.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Before joining opens, the teacher interface MUST show both 「開始加入」 and 「開始答題」; 「開始加入」 MUST be enabled and 「開始答題」 MUST be disabled.
- **FR-002**: After the teacher opens joining and while the activity remains in preparation, the interface MUST keep both buttons visible, disable 「開始加入」, and enable 「開始答題」.
- **FR-003**: The system MUST classify a student, including a team leader, as offline when 30 consecutive seconds have elapsed without a heartbeat, or immediately when that student uses the return action.
- **FR-004**: During team formation, when a team leader goes offline and at least one online member remains, the system MUST promote one eligible remaining member to leader.
- **FR-005**: The system MUST NOT automatically reassign leadership to a former leader whose heartbeat resumes after another member has been promoted.
- **FR-006**: A team with a departed leader and remaining members MUST accept additional students when the activity is still open for joining and existing team-capacity rules permit it; leader departure alone MUST NOT block joining.
- **FR-007**: The system MUST update teacher and team member views when a leader goes offline or leadership changes, within 5 seconds of detecting the change.
- **FR-008**: When no online members remain, the system MUST leave the team without a leader and allow joining only if the activity is in the joining stage.
- **FR-009**: After the teacher starts answering, the interface MUST keep both stage buttons visible and disabled.
- **FR-010**: When a student joins an empty team that has no current leader, the system MUST assign that student the leader role.

### Key Entities

- **Activity**: A teacher-created session with a current stage that governs available teacher actions and whether students may join.
- **Team**: A group of students within an activity, with membership and an optional current leader.
- **Participant presence**: Whether a teacher or student is online, determined by heartbeat freshness or an explicit return action.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The teacher sees both stage buttons in every activity state: before joining opens only 「開始加入」 is enabled; after joining opens only 「開始答題」 is enabled; after answering starts, both are disabled. Neither button is hidden or replaced by the other.
- **SC-002**: In all leader departure cases during team formation where an online member remains, that member becomes leader within 5 seconds of departure detection.
- **SC-003**: Teacher and team member views reflect a leader heartbeat timeout or explicit return within 5 seconds of detection.
- **SC-004**: In all attempts to join a team after its leader leaves, joining is allowed whenever the activity is open and existing team capacity permits it.

## Assumptions

- The offline threshold is inclusive at 30 seconds without a heartbeat: 29,999 milliseconds remains online and 30,000 milliseconds is offline.
- Each team has at most two online seats. A disconnected session may remain linked for recovery without consuming a seat; a returning session must be reassigned if both seats have been filled.
- The first student joining an empty team with no current leader is assigned the leader role.
- “即時更新” means both teacher and student views reflect the change within 5 seconds after the system detects the offline state.
- Existing activity stage transitions and team capacity rules remain authoritative.
