# Implementation Plan: 小組加入、即時作答檢視與學習單匯入

**Branch**: `codex/008` | **Date**: 2026-11-28 | **Spec**: [spec.md](./spec.md)

**Input**: Current 008 specification: phase-aware team joining/presence, teacher live answer progress, and structural worksheet import locked by the teacher's explicit `開放加入` action.

## Summary

Implement the clarified 008 scope in the existing TypeScript client/server/shared application. Keep the three existing activity phases. During `準備中`, the teacher can update the question set until explicitly opening joining; the successful `開放加入` action validates readiness, persists the one-way lock, and opens team enrollment as one state transition without adding a phase. Preserve phase-aware presence and reconnect rules. Extend the teacher's existing roster/live answer view with current per-question progress, answers, and rank. Reuse the Guided Notes import and feature 004 result flows. Keep the student team-formation screen unchanged, including no new total-question-count or question-preview display.

## Technical Context

**Language/Version**: TypeScript 5.9; Node.js `>=22.12`; React 19.

**Primary Dependencies**: React 19, Vite 6, Tailwind CSS 4, Express 5, `ws`, `better-sqlite3`, `@quiz-buzzer/shared`, Vitest 5.1.1. Existing workspace dependencies; no new package planned.

**Storage**: Existing SQLite repositories persist activity phases, worksheet questions/mappings, groups, student sessions/presence, answers, and live revisions. Add nullable activity join-opening and session disconnect markers plus persisted `activity_questions.display_order` in database migration 009 after `008-live-team-activity.sql`; this is the schema migration sequence and is distinct from feature directory number 009, which is reserved for future work. Migration files are discovered and applied in numeric order automatically, so do not add manual registration in `database.ts`. Keep `005-user-stage-recovery.sql` untouched. Backfill `joining_opened_at` only for preparing activities with an assigned student and a ready question set: at least one question, and every question has one or more mappings whose indexes start at zero and are contiguous (`min(slot_order) = 0` and `max(slot_order) = mapping_count - 1`). If no students are assigned or the set is not ready, leave joining closed and preserve memberships so the teacher can complete the set. Map active sessions with legacy `disconnected_until` to offline using their recorded `updated_at`, and backfill existing question display order by ascending `question_number`. New worksheet imports must persist their recognized document order; question, progress, and result reads use `display_order` while answer/mapping identity remains `question_number`. Use one transaction to open joining and freeze the question set, and one transaction for full worksheet replacement.

**Testing**: Existing Vitest unit, integration, and React acceptance suites. Root commands are `npm.cmd test` and `npm.cmd run build`. Tests are planned by the constitution; they have not been run during planning.

**Target Platform**: Current desktop and mobile browsers; Node.js 22 server.

**Project Type**: TypeScript monorepo web application with `client`, `server`, and `shared` workspaces.

**Performance Goals**: After presence or valid-answer state is committed, each authorized connected view renders the latest state within 2 seconds, including the existing 100-group/200-session target. Clean socket close is detected immediately. An unclean interruption is classified offline after 30 consecutive seconds without heartbeat; measure that detection separately from the post-commit render target.

**Constraints**: Keep `準備中`, `搶答進行中`, and `已結束` as the only phases. Joining and question edits are closed until a ready question set exists and the teacher explicitly opens joining during `準備中`; that action atomically freezes import/edit and permits enrollment. Teacher roster states include unavailable, open, full (`額滿` at two online members during team formation), and stopped during answering; the roster still shows online counts only. Team-phase offline classification immediately releases online capacity but retains association for conditional recovery; answering-phase reconnect has no deadline and no new member is admitted; ended participation is unavailable while authorized result review remains. Recognize only the original Guided Notes template and supported variants using `題號`, `題目`, `作答` and merged-cell structure, not markers/fixed coordinates. Preserve source number/order; number gaps are valid and independent from zero-based contiguous mapping indexes. Reject invalid or ambiguous worksheets atomically with row/sheet diagnostics. Teacher live answer progress is role-authorized. Student team-formation view stays unchanged and gains no total-question count or question-content preview.

**Scale/Scope**: One activity with up to 100 groups and 200 sessions. Extend existing `user-stage-sync`, `buzzer-flow`, Guided Notes import, and result-review boundaries. No new service, file format, activity phase, user role, or package.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / gate | Plan assessment |
|---|---|
| I. Validated Inputs and Clear Errors | Pass. Validate import structure/numbering, question mapping readiness, join-open phase/ownership, session authorization, group capacity, and answer validity at server trust boundaries; return safe actionable errors. |
| II. Secret Handling | Pass. Reuse existing environment-backed settings; no credential changes. |
| III. Evidence-Based Testing | Pass by plan. Cover normal and boundary cases for import atomicity/open lock, phase/presence/recovery, teacher progress/rank/privacy, and rendered realtime behavior. Implementation completion must report exact commands/results. |
| IV. Attributed Dependencies and Materials | Pass. Reuse pinned dependencies and existing Guided Notes source; no new external material/package. |
| V. Verifiable Behavior | Pass. Persisted open marker, import outcomes, answer state, authorized events, and UI state provide repeatable evidence. |
| VI. Clear Structure and Consistent Data | Pass. Reuse existing feature modules; preserve the source number/mapping-index distinction; commit opening, imports, and live changes before publishing. |
| VII. Subfeature-Based Delivery | Pass. Feature artifacts stay under `specs/008-runtime-behavior-alignment/` on current branch `codex/008`. |
| VIII. Design-First with PlantUML | Pass. Updated component, class, and sequence diagrams remain the architecture blueprint and have matching rendered PNGs. |

No pre-design gate violations or unresolved product clarifications remain.

## Phase 0: Outline & Research

Research decisions are recorded in [research.md](./research.md). Former feature 009's teacher answer-progress review and worksheet import scope is consolidated into US2 and US4 in this feature; its separate feature artifacts are removed so feature number 009 remains available for future work. Reuse the existing three-phase lifecycle and add only a persisted join-opening gate within `準備中`. The teacher action is the lock boundary; the first student join is not. Database migration 009 preserves existing team-phase membership and offline state. Reuse feature 002 Guided Notes import/source access and feature 004 answer rank/result semantics. Keep imports all-or-nothing, preserve sheet order/source numbers, and keep the student team-formation presentation unchanged. Extend existing role-scoped live events for teacher progress and presence. The teacher roster distinguishes a full team from a team open to joining. No unresolved technology or integration decisions remain.

## Phase 1: Design & Contracts

- [Data model](./data-model.md) defines `joiningOpenedAt`, legacy backfill behavior, import immutability, source question identity/order, membership/presence, full-team roster state, answer progress, and result access.
- [Activity, answer progress, and worksheet import contract](./contracts/team-activity-lifecycle.md) specifies the teacher open action, migration behavior, pre-open edit window, locked state, full-team status, role-scoped roster/progress, and existing student screen.
- [Quickstart](./quickstart.md) validates legacy migration, pre-open edits/retries, not-ready opening rejection, successful open lock, post-open edits rejected even with no students, full-team status, unchanged student screen, lifecycle behavior, teacher progress, privacy, and capacity.
- `diagrams/008-runtime-behavior-alignment-component.puml`, `-class.puml`, and `-sequence.puml` show the explicit action, persisted gate, importer, presence, and live teacher progress. Their PNG companions are rendered in `diagrams/`.

### Post-design Constitution Check

| Principle / gate | Post-design result |
|---|---|
| I. Validated Inputs and Clear Errors | Pass. Contract distinguishes readiness failure, unopened joining, locked import, structural worksheet errors, phase/capacity, and authorization failures. |
| II. Secret Handling | Pass. No credential changes. |
| III. Evidence-Based Testing | Pass by design. Quickstart and tasks identify normal/boundary coverage; no tests are claimed as run in this planning step. |
| IV. Attributed Dependencies and Materials | Pass. Existing dependencies and Guided Notes source only. |
| V. Verifiable Behavior | Pass. Opening marker, immutable question set, revisioned live view, and role-scoped output are observable. |
| VI. Clear Structure and Consistent Data | Pass. Existing workspaces own lifecycle/import/progress; opening and import are transactional; no extra phase or subsystem. |
| VII. Subfeature-Based Delivery | Pass. Feature design remains within 008's directory and current branch. |
| VIII. Design-First with PlantUML | Pass. All three diagrams show the no-new-phase teacher action and its lock boundary; PNGs match the updated sources. |

No post-design violations or exceptions are identified.

## Project Structure

### Documentation (this feature)

```text
specs/008-runtime-behavior-alignment/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── team-activity-lifecycle.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # regenerate separately with $speckit-tasks
```

### Source Code (repository root)

```text
client/src/features/
├── user-stage-sync/         # teacher roster, activity flow, session restore, live state
├── buzzer-flow/             # student answering and teacher answer-progress view
├── results-review/          # existing final-result views ordered by worksheet display order
└── guided-notes/            # existing import view and worksheet operations

server/src/features/
├── user-stage-sync/         # activity/group services, enrollment, presence, roster, realtime
├── buzzer-flow/             # answer persistence, progress query, answer publication
├── results-review/          # existing authorized final-result queries ordered by display order
└── guided-notes/            # structural parser, import validation, transaction, lock check

shared/src/
├── user-stage-sync/         # activity, roster, and presence contracts
├── buzzer-flow/             # answer and teacher progress contracts
└── guided-notes/            # worksheet import contracts

tests/
├── unit/                    # parser, validation, reducers, services
├── integration/             # imports, schema, lifecycle, queries, realtime
└── acceptance/              # teacher/student UI and rendered live state
```

**Structure Decision**: Keep the current client/server/shared workspaces and existing feature ownership; no new top-level project. The teacher open-joining action and phase policy belong with `user-stage-sync`; structural parsing/transaction behavior stays in feature 002 Guided Notes; live answer progress belongs to `buzzer-flow`; final results remain owned by feature 004.

## Complexity Tracking

No constitution violations or additional project layers are planned.
