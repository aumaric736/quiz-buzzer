# Implementation Plan: 課堂搶答結果檢視與檢討

**Branch**: `codex/004-results-review` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-results-review/spec.md`

## Summary

Use the existing activity and submission lifecycle to show each joined student the final per-question winner/no-answer result after end, and give the owner teacher a full post-end answer history with per-question ranks. Expand durable submission storage so each group can have one valid first submission per question, including submissions after another group already won. The earliest committed submission remains the winner; later submissions are review records only. The new activity uses a new activity ID; old rows remain tied to the old activity. The diagrams in `./diagrams/004-results-review-{component,class,sequence}.puml` are the primary blueprint for access boundaries, entities, and review flow.

## Technical Context

**Language/Version**: TypeScript, Node.js `>=22.12` (existing repository engine)

**Primary Dependencies**: React 19, Vite 6, Tailwind CSS 4, Express 5, `better-sqlite3`, `ws`, Vitest; reuse installed workspace packages. Google Sheets continues through the existing official `googleapis` integration in Guided Notes; this feature does not call Sheets.

**Storage**: Existing SQLite activities, sessions, groups, imported questions, and buzzer submissions. Add a migration to retain per-group submissions and per-question ranks while preserving winner identity.

**Testing**: Vitest unit, integration, and acceptance tests using the existing SQLite fixtures and Express app.

**Target Platform**: Local classroom simulation on one machine with the existing React client and Node service.

**Project Type**: Existing three-workspace web application: `client`, `server`, and `shared`.

**Performance Goals**: Post-end results and records must be returned as one complete read per view. No new latency target was specified; preserve the existing local response behavior and index result queries by activity/question/rank.

**Constraints**: Students may not receive complete results before end. The owner teacher alone can read complete answer records. Record one valid first submission per group and question while the activity is live, even after another group wins; invalid and duplicate submissions are not recorded. Compute immutable ranks separately for each question. Keep the first committed record as winner. Keep all records scoped to the activity ID; no same-activity restart is added. Do not expose answers through logs, student live events, or error text. Do not add credentials, packages, or direct Sheets access.

**Scale/Scope**: Local single-machine classroom flow, reusing the project’s existing maximum of one joined group per student session and imported question list. No multi-server synchronization or historical membership service is added; after a student switches to another activity, that session cannot read the former activity’s results.

## Constitution Check

| Principle | Gate |
|---|---|
| I. Validated Inputs and Clear Errors | PASS — result reads validate session, role, activity ownership/membership, and ended phase; persisted record shape is validated before response. |
| II. Secret Handling | PASS — no new secrets or Sheets credentials; keep `.env.example`/`.gitignore`, and exclude answers, request bodies, and provider data from logs. |
| III. Evidence-Based Testing | PASS — plan includes normal and boundary unit, integration, and acceptance cases; commands and results go in quickstart after implementation. |
| IV. Attributed Dependencies and Materials | PASS — reuse installed dependencies and existing license inventory; add no package or external material. |
| V. Verifiable Behavior | PASS — SQLite persistence, server-side authorization, and integration tests verify results; no mock-only feature. |
| VI. Clear Structure and Consistent Data | PASS — keep submission persistence in buzzer-flow, result review routes/service/UI in a dedicated results-review area, and shared response types in `shared`. |
| VII. Subfeature-Based Delivery | PASS — this feature has its own `specs/004-results-review` artifacts and `codex/004-results-review` branch. |
| VIII. Design-First with PlantUML | PASS — component, class, and sequence diagrams define these boundaries and remain alongside PNG renders. |

**Gate result**: No constitution violations or exceptions identified.

## Phase 0: Research Decisions

See [research.md](research.md). Decisions are grounded in the current submission repository, access checks, migration runner, client views, and test patterns. No external library or hosting decision remains open because the user specified the stack and the feature reuses it.

## Phase 1: Design and Contracts

### Blueprint Responsibilities

- **Student results view**: reuse the current student activity page and winner/no-answer result list; show final results only after the activity ends.
- **Teacher review view**: add an activity-history selector and post-end attempt-history table showing question number, group, ordered answer parts, per-question rank, and winner marker. The selector lets the owner return to old activity results after creating a new activity. It is view-only; no grades or notes are persisted.
- **Student final results**: continue through the existing `answer-status` route and `answer-status-access`; after role/membership and ended-phase checks, `WinningAnswerProvider` returns winner-only rows and explicit unanswered rows.
- **Results-review service**: validate teacher session, activity ownership, and ended phase; use the review repository to return the owner’s activity list and complete attempt records.
- **Submission repository**: persist each group's first valid answer per question; assign the next per-question rank inside the immediate transaction; mark only the first committed submission for that question as winner.
- **Existing winner provider and live projection**: filter to the winner row so Guided Notes export and live winner status retain their current contract after multiple records exist per question.
- **Storage**: migrate the existing submissions table while preserving the old winning record as rank 1/winner, then add one-row-per-group/question and one-winner-per-question constraints.
- **Realtime**: no answer-history broadcast. Review reads happen after end over authenticated HTTP; existing phase events remain answer-free.

### API Contracts

Detailed response and authorization behavior is in [contracts/results-review-api.md](contracts/results-review-api.md). The existing student `GET /api/activities/:activityId/answer-status` continues to provide the joined student's final winner/no-answer result after end and only own-submission status while live. Add `GET /api/teacher/activities` for the current teacher's activity list and owner-only, ended-phase `GET /api/activities/:activityId/review-records` for the full teacher history; reject record reads before end.

### Persistence Design

`buzzer_submissions` becomes the attempt-history table while retaining its name and global `accepted_order`. Add `submission_rank` and `is_winner`; change uniqueness from one row per question to one row per `(activity_id, question_number, group_id)` and one row per `(activity_id, question_number, submission_rank)`. A partial unique index permits only one winner row per question. Migration copies each existing winner as rank 1 and `is_winner = 1`. After migration, use `is_winner = 1` in current winner projections/provider. The immediate transaction ensures membership/phase validation, rank allocation, winner selection, and insert serialize together.

### Source Layout

```text
shared/src/results-review/contracts.ts
server/src/features/buzzer-flow/persistence/buzzer-flow-repository.ts
server/src/features/buzzer-flow/application/buzzer-flow-service.ts
server/src/features/user-stage-sync/persistence/migrations/004-results-review.sql
server/src/features/user-stage-sync/application/answer-status-access.ts
server/src/features/buzzer-flow/application/winning-answer-provider.ts
server/src/features/results-review/application/results-review-service.ts
server/src/features/results-review/persistence/results-review-repository.ts
server/src/features/results-review/api/results-review-routes.ts
server/src/app.ts
client/src/features/results-review/services/results-review-api.ts
client/src/features/results-review/components/TeacherActivityHistory.tsx
client/src/features/results-review/components/TeacherSubmissionReview.tsx
client/src/features/user-stage-sync/views/StudentJoinView.tsx
client/src/features/user-stage-sync/views/TeacherActivityView.tsx
tests/unit/results-review/
tests/integration/results-review/
tests/acceptance/results-review/
```

### Implementation and Validation Order

1. Add shared history contracts and migration coverage; verify migration preserves existing winners and enforces ranks/uniqueness.
2. Extend the submission transaction to record one valid submission per group/question after a winner exists while leaving the winner immutable; update winner projections to filter the winner row. Pass focused submission/provider/status tests before adding review routes.
3. Add the owner-filtered teacher activity list, owner-only post-end review-record route, and typed student/teacher result contracts; verify role, phase, completeness, order, unanswered questions, and activity isolation.
4. Add teacher activity-history navigation and the review table, then connect student final results to the existing view. Pass acceptance tests for both roles and pre-end privacy.
5. Run feature and full Vitest suites plus all workspace builds. Compare source and contracts with all three PlantUML blueprints.

## Project Structure

### Documentation (this feature)

```text
specs/004-results-review/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/results-review-api.md
└── tasks.md                 # generated by speckit-tasks
```

### Source Code (repository root)

```text
client/src/features/results-review/
server/src/features/results-review/
shared/src/results-review/
server/src/features/user-stage-sync/persistence/migrations/
tests/unit/results-review/
tests/integration/results-review/
tests/acceptance/results-review/
```

**Structure Decision**: Extend the existing three-workspace TypeScript web app. Keep shared contracts, server application/API/persistence layers, and role-specific React views in the existing workspace boundaries. Do not create another project or replace the existing stack.

## Post-Design Constitution Re-check

All eight principles still pass. The data model constrains group/question duplicates and per-question rank uniqueness; server access is owner/member and ended-phase gated; answer fields remain out of logs; tests validate real persisted behavior; and the plan uses all three diagrams. No exception is required.
