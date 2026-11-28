# Research: Teacher Control Layout

## Decision: Reuse the existing teacher UI components

**Rationale**: The requested team fields are rendered in `client/src/features/user-stage-sync/components/TeacherGroupRoster.tsx`. After omitting leader presence, available row width is divided by weights 2:1:1 for group name/code, online count, and join status; the answer summary remains on its next row and outside this ratio. The activity stage and actions are rendered in `client/src/features/user-stage-sync/views/TeacherActivityView.tsx`. Keeping the changes there matches the current feature boundaries and avoids adding a new component for a small presentation change.

**Alternatives considered**: A new roster or control component was unnecessary and would add indirection without introducing a reusable behavior.

## Decision: Use four equal quarter-width slots for question progress

**Rationale**: `QuestionAnswerProgress.tsx` currently places question buttons in a wrapping flex container, which sizes each tile according to its content and can stretch/reflow the final row. Four equal-width slots per row give each question exactly one quarter of the row width; unused slots remain empty automatically. Keep the existing worksheet display order and empty state.

**Alternatives considered**: Content-sized flex wrapping was rejected because it does not preserve fixed quarter-width tiles or blank slots in an incomplete last row. A nonzero gap between grid tracks was avoided so each tile's outer width remains exactly one quarter of the available row width.

## Decision: Derive control visibility and availability from the existing activity phase

**Rationale**: `ActivitySnapshot.phase` already represents preparation, answering, and ended states. `TeacherActivityView` uses the existing `changeActivityPhase` call for the transition from answering to ended. The existing lower end action is shown during answering; the feature renames it to 「結束答題」 and places it in the former 「開始加入」 slot. The controls can follow the returned phase without changing server behavior or adding state to storage.

**Alternatives considered**: Adding a separate client-side “answer ended” flag could drift from the persisted activity phase and is not needed.

## Decision: Treat this as a UI contract change with no data model or API change

**Rationale**: The feature changes which existing roster attributes are displayed and where teacher actions appear. It does not change team membership, presence calculation, the roster response, or activity lifecycle semantics.

**Alternatives considered**: Removing `leaderOnline` from shared or server data was rejected because the requested scope is the teacher’s display field; other consumers may still use presence data.

## Decision: Align existing Vitest acceptance tests with the new visible behavior

**Rationale**: The existing tests use Node-based React static markup and directly cover the teacher roster and activity controls. Updating those tests verifies the removal, layout state, and disabled ended action without introducing a browser test framework.

**Alternatives considered**: Adding a new testing dependency or changing the test environment is unnecessary for the stated rendering and availability outcomes.

## Repository evidence

- Root scripts define `npm test` as `vitest run`.
- The current targeted teacher UI tests are `tests/acceptance/user-stage-sync/teacher-group-roster.test.tsx` and `tests/acceptance/user-stage-sync/team-joining-open.test.tsx`.
- `tests/acceptance/buzzer-flow/teacher-question-progress.test.tsx` renders `QuestionAnswerProgress` as static markup; extend it with 1, 4, 5, and 8 question cases to confirm row assignment and fixed slot markup.
- Current teacher control markup uses Tailwind utility classes and existing activity phase/API functions.
- Current roster payload includes a leader-presence value; this feature only suppresses its teacher-facing display.
- PlantUML component, class, and sequence diagrams under `diagrams/` are the design references for this plan.

## Open questions

None. The feature description, specification, repository UI structure, and existing phase model define the required behavior.
