---
description: "Task list for Teacher Control Layout"
---

# Tasks: Teacher Control Layout

**Input**: Design documents from `specs/011-teacher-control-layout/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/teacher-ui.md`, `quickstart.md`

**Organization**: Tasks are grouped by the three P1 user stories so each teacher UI change can be implemented and validated independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Tasks in different files with no unmet dependencies can run in parallel.
- **[Story]**: User story label for story-specific work.
- Each task identifies the file to change or validate.

## Path Conventions

- Client source: `client/src/`
- Acceptance tests: `tests/acceptance/`
- Feature design diagrams: `diagrams/`

## Phase 1: Setup

**Purpose**: Confirm project setup needs.

No setup changes are required. The existing TypeScript, React, Vite, Tailwind CSS, and Vitest configuration supports this feature.

## Phase 2: Foundational

**Purpose**: Identify prerequisites shared by the user stories.

No foundational changes are required. All three stories use existing UI components and data contracts.

## Phase 3: User Story 1 - Review team information (Priority: P1) 🎯 MVP

**Goal**: Remove leader online/offline status from the teacher roster, allocate the three roster columns at the specified ratio, and preserve the answer summary on its next row.

**Independent Test**: Render roster records with online and offline leaders; verify both presence labels are absent, group name/code, online count, and join status use 2:1:1 width weights, and the answer summary remains in its existing next-row position outside the ratio.

### Tests for User Story 1

- [x] T001 [P] [US1] Update `tests/acceptance/user-stage-sync/teacher-group-roster.test.tsx` to assert both leader-status variants are absent, the three roster columns use 2:1:1 width weights, and the answer summary remains on the next row; confirm the new assertions fail before changing the component.

### Implementation for User Story 1

- [x] T002 [P] [US1] Update `client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx` to remove the leader presence cell and grid track, apply 2fr to group name/code and 1fr to online count and join status, and preserve the answer summary on its existing next row without adding content.

**Checkpoint**: The roster independently satisfies FR-001 and FR-002.

## Phase 4: User Story 2 - Use answering and ending controls (Priority: P1)

**Goal**: Keep the start controls in place before answering, replace them with 「結束答題」 in the former 「開始加入」 position while answering, and leave the end control visible but unavailable once ended.

**Independent Test**: Render preparation, answering, and ended activity states; verify control visibility, position, and availability in each state.

### Tests for User Story 2

- [x] T003 [P] [US2] Update `tests/acceptance/user-stage-sync/team-joining-open.test.tsx` to cover visible preparation controls, hidden start controls during answering, the end control at the former first-control position, and a visible disabled end control after ending; confirm the new assertions fail before changing the view.

### Implementation for User Story 2

- [x] T004 [P] [US2] Update `client/src/features/user-stage-sync/views/TeacherActivityView.tsx` to conditionally show preparation start controls or 「結束答題」, reuse the existing activity phase transition, place the end control in the former 「開始加入」 position, and keep it visible but disabled in the ended phase.

**Checkpoint**: Activity controls independently satisfy FR-003 through FR-005.

## Phase 5: User Story 3 - Scan question progress (Priority: P1)

**Goal**: Display progress tiles in rows of four equal quarter-width slots, preserving blank positions at the end of an incomplete row.

**Independent Test**: Render progress lists with 1, 4, 5, and 8 questions; verify rows contain at most four questions, each tile uses one quarter of the row width, and incomplete final rows leave the unused positions blank.

### Tests for User Story 3

- [x] T005 [P] [US3] Extend `tests/acceptance/buzzer-flow/teacher-question-progress.test.tsx` with 1-, 4-, 5-, and 8-question cases that assert four equal quarter-width slots per row and unchanged question order and empty state; confirm the new layout assertions fail before changing the progress component.

### Implementation for User Story 3

- [x] T006 [P] [US3] Update `client/src/features/buzzer-flow/components/QuestionAnswerProgress.tsx` to render question tiles in four equal-width slots per row, with each tile filling one 25% slot, no inter-slot gap reducing that width, automatic wrapping after four questions, and unused final-row slots left blank.

**Checkpoint**: Question progress independently satisfies FR-006 and SC-005.

## Phase 6: Polish & Cross-Cutting Checks

**Purpose**: Validate the combined feature and keep its design references aligned.

- [x] T007 Run the targeted Vitest acceptance command from `specs/011-teacher-control-layout/quickstart.md` and resolve any failures in the affected acceptance tests and UI components.
- [x] T008 Compare the resulting roster, activity controls, and question progress layout in `client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx`, `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`, and `client/src/features/buzzer-flow/components/QuestionAnswerProgress.tsx` against `diagrams/011-teacher-control-layout-component.puml`, `diagrams/011-teacher-control-layout-class.puml`, and `diagrams/011-teacher-control-layout-sequence.puml`; if a diagram source changes, rerender PNGs with `java -jar plantuml.jar "./diagrams/*.puml"`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No code tasks; project configuration is already in place.
- **Foundational (Phase 2)**: No code tasks; existing types, data, and UI structure are sufficient.
- **User Stories (Phases 3-5)**: No cross-story dependency; all are independently implementable after setup confirmation.
- **Polish (Phase 6)**: Depends on all three user stories; run targeted acceptance validation before the final diagram review.

### User Story Dependencies

- **User Story 1 (P1)**: Independent; roster behavior can be implemented and tested without the control or progress changes.
- **User Story 2 (P1)**: Independent; activity control behavior can be implemented and tested without the roster or progress changes.
- **User Story 3 (P1)**: Independent; progress tile layout can be implemented and tested without the roster or control changes.

### Within Each User Story

- Update the story's acceptance test first and confirm the new assertions fail.
- Implement the corresponding component or view after its test task.
- Different stories can proceed in parallel because they touch separate test and source files.

## Parallel Opportunities

- T001, T003, and T005 can proceed in parallel because each updates a separate acceptance-test file.
- After those tests are confirmed failing, T002, T004, and T006 can proceed in parallel because each updates a separate UI source file.
- T007 and T008 run after all stories; T007 precedes the final diagram check in T008.

## Parallel Example: User Stories 1-3

```text
Contributor A: T001 -> T002 (teacher roster)
Contributor B: T003 -> T004 (activity controls)
Contributor C: T005 -> T006 (question progress tiles)
After all: T007 -> T008 (validation and diagram review)
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001 and T002.
2. Validate roster behavior independently with the focused acceptance test.
3. The roster cleanup is the smallest standalone release slice.

### Incremental Delivery

1. Deliver User Story 1 after its roster acceptance test passes.
2. Deliver User Story 2 after its activity-state acceptance test passes.
3. Deliver User Story 3 after its question-count/layout acceptance tests pass.
4. Complete T007 and T008 before treating the feature as complete.

## Notes

- Task IDs follow execution order; all tasks use checkbox, ID, and file path format.
- Tests are included to meet the implementation plan and project constitution's verifiable-behavior requirements.
- No setup, data migration, API, or dependency tasks are needed for this client-only feature.
