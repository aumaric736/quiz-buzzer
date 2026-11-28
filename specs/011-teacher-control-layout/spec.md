# Feature Specification: Teacher Control Layout

**Feature Branch**: `codex/011`

**Created**: 2026-11-28

**Status**: Draft

**Input**: User description: 老師瀏覽各組的畫面資訊中「組長在線」/「組長離線」欄位移除，也不要再加入其他功能填充；原位置適當安排給左右原本的欄位。點擊「開始答題」後，原位置的「開始加入」跟「開始答題」兩個按鈕都隱藏，將下方的「結束答題」顯示在原本「開始加入」的位置。「結束答題」按下後不用隱藏，改為不可用狀態就好。

## Clarifications

### Session 2026-11-29

- Q: How should the answer summary be positioned and included in the roster column width ratio? → A: Keep the answer summary on the next row in its existing layout; exclude it from the 2:1:1 roster column width ratio.
- Q: How should the teacher's per-question answering progress be arranged? → A: Show exactly four questions per row, each occupying one quarter of the available width; place additional questions on following rows and leave unused slots in the final row blank.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review team information (Priority: P1)

As a teacher viewing teams, I want the team leader online/offline field removed and the existing neighboring fields to use the freed space, so that the team view contains only the information already intended for it.

**Why this priority**: The requested cleanup applies directly to the teacher's team review screen and avoids adding unrelated content.

**Independent Test**: Open the teacher's team list and verify that leader online/offline status is absent, the group name/code, online-count, and join-status columns receive available width at a 2:1:1 ratio, and the answer summary remains on the next row in its existing layout.

**Acceptance Scenarios**:

1. **Given** the teacher is viewing teams, **When** team details are displayed, **Then** neither 「組長在線」 nor 「組長離線」 is shown as a field.
2. **Given** the leader presence field has been removed, **When** the teacher views each team's roster, **Then** the group name/code, online-count, and join-status columns receive available row width at a 2:1:1 ratio, the answer summary remains on the next row in its existing layout and outside that ratio, and no new information or controls are added.

---

### User Story 2 - Use answering and ending controls (Priority: P1)

As a teacher running an activity, I want the controls to transition from start actions to an end action in the established control position, so that the current available action is clear.

**Why this priority**: These controls govern the teacher's primary activity flow and must clearly reflect whether answering has started or ended.

**Independent Test**: Start answering, inspect the controls and their placement, then end answering and verify that the end control remains visible but cannot be used again.

**Acceptance Scenarios**:

1. **Given** answering has not started, **When** the teacher views the activity controls, **Then** 「開始加入」 and 「開始答題」 appear in their current positions.
2. **Given** the activity is ready to start answering, **When** the teacher selects 「開始答題」, **Then** both 「開始加入」 and 「開始答題」 are hidden and 「結束答題」 appears at the former 「開始加入」 position.
3. **Given** answering is in progress, **When** the teacher selects 「結束答題」, **Then** 「結束答題」 remains visible in that position and becomes unavailable for further selection.

---

### User Story 3 - Scan question progress (Priority: P1)

As a teacher reviewing live answering progress, I want each question's progress tile to use a fixed quarter of the available width, so that progress is arranged consistently in rows of four.

**Why this priority**: Fixed-width progress tiles keep each question aligned and prevent a short final row from expanding its remaining tiles.

**Independent Test**: Render progress lists containing 1, 4, 5, and 8 questions; verify no row contains more than four questions, each tile uses one quarter of the row width, and unfilled final-row positions remain empty.

**Acceptance Scenarios**:

1. **Given** a teacher has one to four questions with progress, **When** the progress view is displayed, **Then** the questions occupy one row with each question using one quarter of the available width.
2. **Given** a teacher has more than four questions with progress, **When** the progress view is displayed, **Then** each additional set of up to four questions starts on a following row, and any unfilled positions in the last row remain blank without widening the other questions.

### Edge Cases

- A teacher viewing a team must not see either online or offline variants of the removed leader-presence field.
- Before answering starts, the existing placement of both start controls remains unchanged.
- Once 「結束答題」 is unavailable, it remains visible and unavailable in the activity's ended state.
- The per-question progress list has no more than four question tiles in a row; an incomplete final row retains blank quarter-width positions.
- When no question progress is available, the existing empty-state message remains displayed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The teacher's team information view MUST omit the 「組長在線」/「組長離線」 field, regardless of the leader's presence state.
- **FR-002**: After removal of the leader-presence field, the teacher roster MUST distribute available row width at a 2:1:1 ratio across the existing group name/code, online-count, and join-status columns; the answer summary MUST remain on its existing next row and MUST NOT be included in this ratio; the system MUST NOT add new fields, information, or controls to fill the space.
- **FR-003**: Before answering starts, 「開始加入」 and 「開始答題」 MUST remain in their existing positions.
- **FR-004**: When the teacher starts answering, the system MUST hide 「開始加入」 and 「開始答題」 and show 「結束答題」 in the former 「開始加入」 position.
- **FR-005**: When the teacher ends answering, the system MUST leave 「結束答題」 visible in that position and make it unavailable for further selection.
- **FR-006**: The per-question answering progress view MUST display no more than four question tiles per row, with each tile occupying exactly one quarter of the available row width; questions beyond the first four MUST start on following rows, and unfilled positions in the final row MUST remain blank rather than expanding other tiles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In every teacher team-view state, the leader online/offline field appears zero times, and each roster row distributes its available width at a 2:1:1 ratio across the group name/code, online count, and join-status columns without additional content.
- **SC-002**: After starting answering, both start controls are hidden and the end control appears in the former 「開始加入」 position.
- **SC-003**: After ending answering, 「結束答題」 remains visible and cannot be activated again.
- **SC-004**: Before answering starts, both start controls retain their existing positions.
- **SC-005**: For any non-empty question progress list of N questions, the view displays `ceil(N/4)` rows; each question occupies 25% of its row's available width, each row contains at most four questions, and the final row's unused positions remain empty.

## Assumptions

- The existing pre-answer start-control layout is the reference for the positions described by the user.
- “不可用” means the end control remains visible but cannot trigger another end action.
- The change is limited to the specified roster layout, activity control states, and per-question progress tile layout; it adds no other feature or information.
