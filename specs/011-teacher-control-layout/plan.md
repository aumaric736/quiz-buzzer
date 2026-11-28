# Implementation Plan: Teacher Control Layout

**Branch**: `codex/011` | **Date**: 2026-11-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/011-teacher-control-layout/spec.md`

## Summary

Update the teacher team roster to remove leader online/offline text and allocate available row width in a 2:1:1 ratio to the existing group name/code, online-count, and join-status columns, leaving the answer summary on its next row. Update the activity control layout so the start controls appear only before answering, then replace their first slot with 「結束答題」; after the activity ends, keep that control visible and disabled. Arrange question progress in rows of four equal quarter-width tiles, leaving unused slots in the final row blank. Implement these focused React/Tailwind presentation changes with Vitest acceptance coverage and no new dependencies or unrelated content.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19

**Primary Dependencies**: Vite 6, Tailwind CSS 4; existing shared activity types and activity API

**Storage**: N/A; no data or persistence changes

**Testing**: Vitest 5.1, Node environment, React static markup acceptance tests

**Target Platform**: Existing browser-based teacher interface

**Project Type**: Web application (client/server/shared workspaces); this feature changes the client only

**Performance Goals**: No additional render or network work; preserve current response behavior

**Constraints**: Keep current activity phase and API contracts; allocate roster row width by the specified 2:1:1 column weights; introduce no replacement roster fields, actions, or dependencies. Use the project’s TypeScript, React, Vite, Tailwind CSS, and Vitest stack.

**Scale/Scope**: Three existing teacher UI components and their acceptance coverage; no server, shared schema, or persistence changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Evidence |
|---|---|---|
| Validated Inputs and Clear Errors | Pass | No new input or trust boundary; existing activity API and error handling remain in use. |
| Secret Handling | Pass | No secrets or configuration changes. |
| Evidence-Based Testing | Pass | Plan updates the existing roster and control acceptance tests and extends the question-progress test for four-column layout and incomplete final rows. |
| Attributed Dependencies and Materials | Pass | No new dependency or external material. |
| Verifiable Behavior | Pass | UI outcomes are covered by existing Vitest static-markup acceptance patterns. |
| Clear Structure and Consistent Data | Pass | Changes stay in the existing teacher view and roster component; shared activity data is unchanged. |
| Subfeature-Based Delivery | Pass | Work is on `codex/011` and documented under `specs/011-teacher-control-layout`. |
| Design-First with PlantUML | Pass | The feature’s component, class, and sequence diagrams are referenced as design constraints in Phase 1. |

No constitution violations or exceptions are required.

## Project Structure

### Documentation (this feature)

```text
specs/011-teacher-control-layout/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── teacher-ui.md
└── tasks.md                 # Produced by $speckit-tasks
```

### Source Code (repository root)

```text
client/src/features/user-stage-sync/
├── components/
│   └── TeacherGroupRoster.tsx
└── views/
    └── TeacherActivityView.tsx

client/src/features/buzzer-flow/components/
└── QuestionAnswerProgress.tsx

tests/acceptance/user-stage-sync/
├── teacher-group-roster.test.tsx
└── team-joining-open.test.tsx

tests/acceptance/buzzer-flow/
└── teacher-question-progress.test.tsx

diagrams/
├── 011-teacher-control-layout-component.puml
├── 011-teacher-control-layout-component.png
├── 011-teacher-control-layout-class.puml
├── 011-teacher-control-layout-class.png
├── 011-teacher-control-layout-sequence.puml
└── 011-teacher-control-layout-sequence.png
```

**Structure Decision**: Update the existing teacher roster and activity view in `client/src/features/user-stage-sync`, plus the existing question progress component in `client/src/features/buzzer-flow`. Extend their existing acceptance tests. No new source modules, APIs, or persistent data are needed.

## Complexity Tracking

No constitution violations; no complexity exceptions.
