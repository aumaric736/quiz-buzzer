# Implementation Plan: 小組活動與逐題搶答

**Branch**: `codex/006` | **Date**: 2026-11-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification at `/specs/006-two-person-teams/spec.md`; requested stack is TypeScript, React, Vite, Tailwind CSS, and Vitest.

## Summary

Extend the existing classroom app with configured teacher sign-in, activity setup, student group enrollment, single-question submissions, reconnect recovery, final result publication, and retryable Guided Notes writeback. Each group receives a cryptographically random fixed six-character numeric invite-code string, including leading zeroes, unique within its activity. Groups are limited to 100 per activity. A group holds at most two active membership sessions; the app does not claim those sessions represent distinct people. A disconnected session retains its slot for two minutes, reconnecting restores it, and expiry releases it. Submitted answers remain group-scoped across sessions and devices. Reuse the current TypeScript workspaces, Express API, SQLite persistence, WebSocket transport, and Google Sheets integration; add no runtime dependency.

## Technical Context

**Language/Version**: TypeScript 5.9; Node.js `>=22.12`; React 19.

**Primary Dependencies**: Existing React 19, Vite 6.4, Tailwind CSS 4.1, Express 5.1, `better-sqlite3` 12, `ws` 8, Google APIs client, and Vitest 5. No new runtime package is planned.

**Storage**: Existing SQLite database with forward-only migrations for group invite codes, group membership roles, per-session disconnect deadlines, teacher ownership/deadlines, operation receipts, and export attempt state. Browser local storage keeps only unsubmitted drafts.

**Testing**: Existing Vitest unit, integration, and acceptance suites using the real Express app and SQLite fixtures.

**Target Platform**: Classroom local network. Configure the API and Vite dev server for trusted LAN device access while retaining loopback defaults for local development. Google and teacher credentials remain server-side.

**Project Type**: Existing three-workspace web app: `client`, `server`, and `shared`.

**Performance Goals**: Support 100 groups per activity and up to two active membership sessions per group. The mandatory MVP acceptance verifies that all 200 sessions can join and appear in the teacher roster; one session per group submits one valid answer, and the other session sees the shared answer while a resubmission creates no second accepted answer. No latency or uptime SLO was specified. Preserve deterministic single-process ordering for submissions and activity end.

**Constraints**: One authenticated teacher owner per activity; random fixed-width six-character numeric group invite-code strings (leading zeroes valid) unique within an activity; no wrong-code attempt limit; at most two active membership sessions per group; a two-minute student reconnect window; max 100 groups/activity and no minimum; no person-level student identity; team-scoped submissions; drafts stay device-local; students cannot observe other teams' live submissions or global order; all ended results remain read-only even if Sheets is unavailable.

**Scale/Scope**: One Node server and SQLite database on a classroom LAN; one configured teacher login; up to 100 groups and 200 active membership sessions per activity. No multi-server synchronization, public hosting, registration, or external identity provider.

## Constitution Check

| Principle | Gate |
|---|---|
| I. Validated Inputs and Clear Errors | PASS — validate credentials, activity and fixed six-character numeric invite-code strings (including leading zeroes), group scope/capacity, roles, question membership, answer shape, lifecycle phase, and export retry state at server boundaries. |
| II. Secret Handling | PASS — teacher/Google credentials remain in ignored `.env`; `.env.example` contains placeholder names only; logs redact credentials, answer content, and session tokens. Invite codes are intentionally shared group credentials, not student identities. |
| III. Evidence-Based Testing | PASS — the implementation tasks cover normal, invalid, boundary, concurrent, privacy, reconnect, code collision, 100-group/200-session capacity, no-winner, and export retry cases in Vitest. |
| IV. Attributed Dependencies and Materials | PASS — reuse installed workspaces and dependencies; no new package or external material. |
| V. Verifiable Behavior | PASS — group seats, deadlines, submissions, and results are server-authoritative and persisted; tests use SQLite and API flows. |
| VI. Clear Structure and Consistent Data | PASS — preserve client/server/shared boundaries and transactional activity/group/session/submission invariants. |
| VII. Subfeature-Based Delivery | PASS — work remains on the feature branch `codex/006` with feature-local artifacts. |
| VIII. Design-First with PlantUML | PASS — refreshed the component, class, and sequence sources in repository-root `diagrams/` for random activity-scoped invite codes and two-minute membership-session retention; rendered all three to PNG with Eclipse Temurin JDK 17. |

**Gate result**: All eight principles pass. The three root-level `.puml` sources and corresponding PNG renders are present and aligned with this plan.

## Phase 0: Outline & Research

See [research.md](research.md). Repository inspection and two focused codebase reviews confirmed that group creation currently accepts a free-form name, sessions are stored in `user_sessions`, socket close currently does not retire sessions, and answer submissions already use group identity. Decisions reuse those boundaries, add random activity-scoped invite codes, count active membership sessions rather than socket connections, and persist two-minute disconnect deadlines for students and teachers.

## Phase 1: Design & Contracts

See [data-model.md](data-model.md), [contracts/api-contracts.md](contracts/api-contracts.md), and [quickstart.md](quickstart.md). The designs define fixed-width invite-code collision handling, 100-group/200-session capacity acceptance, two active session seats, reconnect/expiry/leave transitions, answer receipt ordering and privacy, and immutable final results with retryable Sheets export. Architecture diagrams live in the repository-root `diagrams/` directory as required by the constitution.

### Blueprint Responsibilities

- **Teacher sign-in and activity control**: authenticate against configured server credentials; issue an existing opaque teacher session only after validation; create and own one activity; explicit leave ends it immediately.
- **Teacher presence**: persist a two-minute deadline when the last owner socket closes; cancel on reconnect; end on expiry; reconcile elapsed deadlines at server startup.
- **Activity and group entry**: display the existing activity ID as the activity join code. Let students choose leader or member. Create an activity-scoped random fixed-width six-character numeric-string invite code, including leading zeroes; enforce same-activity uniqueness and retry collisions atomically. Cap groups at 100. Do not collect student numbers or expose a sequential group count through codes.
- **Membership sessions**: count at most two non-retired, non-expired student membership sessions per group. The leader's session occupies the first seat. Multiple device sockets attached to the same session occupy one seat. A member join or invite-code rejoin creates a new session and needs an open seat. A live session disconnect sets a durable two-minute deadline; reconnect within the deadline restores that same session and seat. Explicit leave frees the seat immediately. Expiry retires the session and frees its seat. Leader leave/expiry closes the group to new sessions; other active sessions can continue. This is a session limit, not verification of distinct people. The teacher roster labels and returns this count as active sessions, not student headcount.
- **Group invite-code policy**: invite codes are random numeric strings and unique only within their activity. Codes may repeat in different activities because students first enter the activity. Wrong-code attempts have no attempt-count or cooldown limit. Server still validates code format, activity scope, activity phase, and group capacity.
- **Question drafts and submissions**: keep unsent drafts in browser local storage keyed by activity/group/question. Submit one question per request. Trim only for nonblank validation; persist the original answer. A group's first valid answer per question is shared across all its active sessions.
- **Receipt ordering and winner**: allocate monotonic per-activity receipt sequence after a complete request is received. Serialize answer and end operations and apply them in SQLite immediate transactions. First valid submission for each question wins; other groups may continue through end. Invalid requests do not consume accepted ranks or group/question eligibility. Do not score correctness.
- **Live views and results**: student REST/WebSocket projections expose only phase/question and the caller team's own status, answer, and receipt state; never expose another team's activity or global sequence. Teacher views can inspect all valid submissions/order. Publish all winners and no-winner rows at activity end. After end, allow read-only final-result lookup using only the activity join code; it creates no session or group seat.
- **Guided Notes writeback**: reuse the existing server-side preview/confirm, source verification, and export attempt state. A no-winner row skips its source cell. Export failure or uncertainty never reopens the activity or changes final results; permit safe retry.
- **MVP export boundary**: include the durable retry-state/safe-retry service (T050) with the teacher export-status and retry controls (T052), so retry UI is backed by persisted state and cannot repeat a write unsafely.
- **LAN access**: configure API bind host and client origin for a trusted classroom LAN while keeping development defaults and server-only Sheets credentials.

### Constitution Check After Design

All eight gates remain PASS. Migration/database uniqueness and session transitions enforce group limits, privacy boundaries, and lifecycle; feature tests cover normal and boundary cases; no dependencies are added. Component, class, and sequence PlantUML sources and PNG renders are included as architecture artifacts.

## Implementation Approach

1. **Configuration and teacher session**: add server-side environment validation for teacher credentials and LAN origin/host; authenticate and protect owner routes.
2. **Persistence migration**: add nullable activity and student-session disconnect deadlines, group invite code, leader session/closure state, and membership role/state as needed; add `(activity_id, invite_code)` uniqueness; preserve existing answer tables and add receipt ordering/export retry fields only when not already available.
3. **Group workflow**: replace name-based creation with leader/member modes. Generate a cryptographically random fixed six-character numeric string including leading zeroes, collision-check inside an immediate transaction, enforce 100 groups and two active membership sessions, return invite code and active session count, and preserve existing team-scoped answer records. Validate capacity with 100 groups holding two sessions each: all 200 sessions join and appear in roster reads, one valid answer is submitted per group, and the other session sees the shared answer without creating a second accepted answer on resubmission.
4. **Presence and recovery**: track sockets by session; start a durable two-minute student deadline only after that session's last socket closes; cancel on reconnect; expire sessions at deadline, free a seat, and close a group if its leader session expires. Startup reconciliation handles elapsed deadlines. Explicit student leave retires immediately; explicit teacher leave ends immediately.
5. **Answer flow**: implement full-body receipt ordering, validation, exact retry behavior, original-answer persistence, one-question submissions, team-only student projections, teacher-only full live review, and race-safe end handling.
6. **Client and export**: add authenticated teacher login, activity join, group invite-code UI, per-question local drafts, read-only final results, and retryable Guided Notes status.
7. **Verification and design alignment**: add Vitest normal/boundary/concurrency/privacy/reconnect/export cases; run the feature suite and workspace build during implementation; compare behavior with the PlantUML blueprints.

## Project Structure

### Documentation (this feature)

```text
specs/006-two-person-teams/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api-contracts.md
└── tasks.md
```

Feature diagrams (component, class, sequence) are maintained at repository-root `diagrams/` and rendered beside their `.puml` sources.

### Source Code (repository root)

```text
client/src/features/user-stage-sync/       # login, activity join, group setup and session recovery
client/src/features/buzzer-flow/            # question drafts, submissions and results
client/src/features/guided-notes/            # import, preview, writeback status and retry
server/src/features/user-stage-sync/        # auth, activity lifecycle, sessions, groups and migrations
server/src/features/buzzer-flow/             # validation, receipt ordering, persistence and live projections
server/src/features/guided-notes/             # server-only Sheets gateway and export attempts
shared/src/{user-stage-sync,buzzer-flow,guided-notes}/contracts.ts
tests/unit/{user-stage-sync,buzzer-flow,guided-notes}/
tests/integration/{user-stage-sync,buzzer-flow,guided-notes}/
tests/acceptance/{user-stage-sync,buzzer-flow,guided-notes}/
```

**Structure Decision**: Extend existing client/server/shared workspaces and migration chain. Keep team membership/session ownership in `user-stage-sync`, answer/rank behavior in `buzzer-flow`, and Sheets attempts in `guided-notes`. Keep drafts only in the browser.

## Complexity Tracking

No constitution exception or new workspace is proposed. The accepted two-session limit intentionally does not assert two distinct human identities; group invite codes are shared team credentials. Wrong-code submissions are not rate-limited by product decision.
