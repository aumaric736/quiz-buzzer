# Research: 小組活動與逐題搶答

## Decisions

### Reuse the current application workspaces

- **Decision**: Keep TypeScript 5.9, Node.js `>=22.12`, React 19, Vite 6.4, Tailwind CSS 4.1, Express 5, SQLite through `better-sqlite3`, WebSockets through `ws`, Google APIs client, and Vitest 5. Add no runtime package.
- **Rationale**: These dependencies and feature boundaries are already present. Existing activities, local sessions, group-scoped answers, Guided Notes import/export, and role views provide implementation seams.
- **Evidence**: Root and workspace package manifests; `server/src/features/user-stage-sync/`; `server/src/features/buzzer-flow/`; `server/src/features/guided-notes/`; `client/src/features/`.
- **Alternatives considered**: Add another backend/auth stack or replace the frontend. Rejected because this is a single classroom app with all needed capabilities already installed.

### Generate random fixed-width six-character activity-scoped group invite-code strings

- **Decision**: Generate each invite code on the server as a six-character numeric string, including leading zeroes; require uniqueness within its activity and regenerate on collision. Allow the same code in a different activity. Keep the 100-group cap. Do not add a wrong-code attempt limit or cooldown.
- **Rationale**: Random codes do not expose group creation order or reveal how many teams exist. The activity join code scopes group lookup, so global uniqueness adds no disambiguation and needlessly consumes a finite code space. A server-side uniqueness constraint and collision retry close concurrent creation races.
- **Evidence**: User clarification; current `group-service.ts` accepts a name and `group-repository.ts` inserts the group; migration `001-user-stage-sync.sql` uniquely scopes group names by activity. Node's built-in `node:crypto` can generate secure random integers without dependencies.
- **Alternatives considered**: Sequential `001`–`100` codes expose group count/order; global invite-code uniqueness is unnecessary after activity join; rate limiting was explicitly declined.

### Define invite codes as fixed-width strings and roster counts as sessions

- **Decision**: Treat every group invite code as a six-character numeric string, including leading zeroes (for example, `004271`). Teacher rosters expose each group's active membership-session count and do not describe it as verified student headcount.
- **Rationale**: Numeric parsing can drop leading zeroes, while the system has no person-level identity with which to verify actual students. String validation and an accurately labeled session count preserve the specified behavior.
- **Evidence**: Clarifications I1 and A1 in `spec.md`; the existing server roster projection already returns active session counts.
- **Alternatives considered**: Disallow leading zeroes or label session slots as people; both conflict with the accepted code format or overstate what the application verifies.

### Model a two-seat limit as active membership sessions, not people or sockets

- **Decision**: Count at most two active student membership sessions per group, including the leader session. A session may have multiple WebSocket/device connections and still occupies one seat. Joining or rejoining with the invite code creates a new session and requires an empty seat. The system does not verify that two sessions represent two different humans.
- **Rationale**: The app intentionally has no personal identifiers, and a group code is shared. It therefore cannot distinguish a returning person from a new person after session loss. Counting active persisted sessions is enforceable and keeps answer access group-scoped.
- **Evidence**: `user_sessions` stores opaque session IDs, activity/group IDs, and `retired_at`; WebSocket subscriptions are stored separately per socket; buzzer submissions are uniquely keyed by activity/question/group.
- **Alternatives considered**: Add per-student accounts or personal recovery credentials, which contradict the selected shared team identity; count every socket as a seat, which would count multiple devices for one session separately; claim a physical two-person limit that cannot be verified.

### Keep student seat through a two-minute disconnect window

- **Decision**: When a session's last socket disconnects unexpectedly, persist a two-minute deadline. Reconnection before expiry restores the same session and seat and clears the deadline. Explicit leave retires immediately. On expiry, retire the session and free its seat; if the expired session is the leader's, close that group to new sessions. Reconcile expired deadlines on server startup.
- **Rationale**: The existing WebSocket server removes a socket subscription but does not retire the session. Persisting a deadline avoids transient network loss freeing a seat, while startup reconciliation prevents an expired seat from remaining occupied after a process restart.
- **Evidence**: `server/src/features/user-stage-sync/realtime/websocket-server.ts` tracks `{activityId, sessionId}` per socket and drops subscriptions on close/error; `application/session-service.ts` retires sessions; current schema has `retired_at` but no deadline.
- **Alternatives considered**: Free a seat immediately on socket close, which breaks reconnect; count sockets rather than membership sessions; keep the deadline only in memory, which loses it on restart.

### Preserve existing teacher authentication and end lifecycle boundaries

- **Decision**: Validate one configured teacher username/password on the server, issue the existing opaque teacher session only after successful login, enforce activity owner checks, and use the same durable two-minute reconnect pattern for the teacher. Teacher explicit leave ends immediately; timeout and answer operations share ordered handling.
- **Rationale**: This meets teacher ownership and grace-period behavior without registration or another identity provider.
- **Evidence**: Existing `user_sessions`, activity owner field, Express routes, and activity WebSocket subscription.
- **Alternatives considered**: Public teacher-role selection does not authenticate; external account service is beyond scope.

### Retain one accepted answer per group/question with one winner per question

- **Decision**: Continue using activity/group/question answer identity. Preserve every team's first valid answer until end; the earliest valid request received for a question wins. Other groups may submit until end. Preserve the original answer text and do not score correctness.
- **Rationale**: Existing schema and repository already store submissions, rank, and winner. It matches the requirement that distinct teams can win different questions and all valid answers remain available to teachers.
- **Evidence**: `server/src/features/buzzer-flow/persistence/migrations/004-results-review.sql`, `buzzer-flow-repository.ts`, and current answer visibility tests.
- **Alternatives considered**: Lock a question after its first answer or allow last-write-wins; both contradict the selected behavior.

### Serialize complete request receipts with activity end

- **Decision**: Assign a monotonically increasing per-activity operation sequence after the complete body is received. Order answer and teacher end/timeout operations through one synchronous queue and SQLite immediate transactions. Invalid answer operations consume operation order but not accepted answer rank or group/question eligibility. Never expose sequence to students.
- **Rationale**: The user defines fastest as complete request arrival at the server and requires one deterministic outcome for answer/end races.
- **Evidence**: Existing service writes are synchronous SQLite transactions. The route/body-parser boundary can assign the sequence after request parsing completes.
- **Alternatives considered**: Client click timestamps are untrusted; wall-clock timestamps alone can tie.

### Keep drafts device-local and submitted answers group-shared

- **Decision**: Save unsent drafts in browser local storage keyed by activity, group, and question. Store submitted answers in SQLite under activity/group/question and expose only that group's acknowledgment/status to students.
- **Rationale**: This keeps independent questions and devices' drafts separate while retaining shared team answer eligibility.
- **Evidence**: Existing React student answer view and server answer status projection.

### Reuse Guided Notes export preview and attempt tracking

- **Decision**: Reuse the existing server-side export preview, confirmation, source verification, and export-attempt repository. No-winner questions skip their mapped cells. Failed/uncertain writes remain retryable after activity end without reopening or mutating results.
- **Rationale**: The current feature already handles Google Sheets writes and reconciliation; preserving it limits scope and prevents browser exposure of Google credentials.
- **Evidence**: `server/src/features/guided-notes/application/`, `persistence/export-attempt-repository.ts`, and existing export tests.
- **Alternatives considered**: Direct browser writes or a second export subsystem, both of which duplicate behavior or expose credentials.
- **MVP boundary**: Include persisted retry state and safe-retry service (T050) with teacher retry controls (T052); the UI must not offer retries without the service that validates and records them.

### Verify full activity membership capacity

- **Decision**: Make T056 a mandatory MVP exit gate with 100 groups and two active membership sessions in each group (200 sessions total). Verify all sessions can join and appear in the teacher roster; submit one valid answer per group; verify the other session sees the shared answer and resubmission creates no second accepted answer.
- **Rationale**: The group cap and per-group seat cap compose into the promised activity capacity. The test must validate enrollment and roster projection for all seats while preserving the existing one-answer-per-group/question invariant.
- **Evidence**: Clarification G1 in `spec.md`; the scale target is one classroom activity on the existing Node/SQLite deployment.
- **Alternatives considered**: Test only 100 groups and a single group's two seats independently; this misses integration issues at the combined limit.

### Keep student live-data privacy rules canonical

- **Decision**: FR-010 is the canonical rule for student-readable and prohibited live data. FR-020 describes per-group/per-question submission locking and refers back to FR-010 for privacy.
- **Rationale**: One source of truth prevents the live privacy policy from drifting while keeping submission semantics explicit.
- **Evidence**: Clarification D1 in `spec.md`.
- **Alternatives considered**: Repeat the full data prohibition in both requirements, which risks inconsistent edits.

### Allow read-only final results by activity code after end

- **Decision**: After an activity ends, return its complete immutable results to anyone holding the activity join code through a read-only endpoint. Do not require an active group session or consume a group seat. Reject this endpoint while the activity is live.
- **Rationale**: Final results are published to students as a whole; requiring a live seat would prevent a student whose two-minute session expired from refreshing results after end. The activity code gates access, and no mutations are allowed.
- **Evidence**: Clarified FR-016 and SC-006; the activity identifier is already the displayed activity join code.
- **Alternatives considered**: Require a current team session, which conflicts with full-seat rejection and session expiry; allow the endpoint during the live activity, which would expose winner information early.

### Configure trusted classroom LAN access

- **Decision**: Make API bind host and client origin configurable, retain loopback defaults, and document trusted LAN use. Keep credentials on the server.
- **Rationale**: Student devices must reach one teacher-hosted instance, while the current app defaults to localhost.
- **Evidence**: Existing Vite and Express development setup and `.env.example`.

## Risks and mitigations

- **Random-code collision**: enforce `UNIQUE(activity_id, invite_code)` and generate/retry within the same transaction.
- **Unlimited incorrect-code attempts**: explicitly accepted product behavior; keep activity scoping and generic unknown/full/closed error responses so other groups' existence is not disclosed.
- **Session count is not person count**: label teacher roster count as active sessions and do not claim physical headcount enforcement.
- **Student disconnect races**: persist deadline, cancel it on session reconnect, and serialize expiry with group joins.
- **Sheets uncertainty**: preserve attempt IDs and verify the destination before retrying.
