# Research: 使用者角色與活動階段同步

The selected stack and feature constraints were checked against official
project/platform documentation. The feature uses a local Express service and
SQLite; it does not call Google Sheets. Sheets was explicitly deferred to a
later subfeature, where its data contract and credential model can be specified.

## Decisions

### Use the requested React/Vite/TypeScript client

- **Decision**: Build a TypeScript React client with Vite and Tailwind CSS.
- **Rationale**: This is the stack explicitly selected by the user. React's
  current documentation recommends a framework for many production apps, but
  also documents a custom Vite setup; this feature needs a small local client
  with a separately specified Express service. The custom setup leaves routing
  and data-fetching conventions to the project.
- **Compatibility**: The workspace targets Node.js 22.12+ and uses the
  `tailwindcss` plus `@tailwindcss/vite` integration. Vite 6.4.6 and Vitest
  5.1.1 match the current npm audit fix recommendations; Vitest 5.1.1 requires
  Node.js 22.12+ or Node.js 24+. Rerun `npm audit` when updating these versions.
- **Alternatives considered**: An integrated React framework would add a
  framework choice beyond the user's selected Vite client and is unnecessary
  for the local-only feature.
- **Sources**: [React custom app guide](https://react.dev/learn/build-a-react-app-from-scratch),
  [Vite guide](https://vite.dev/guide/),
  [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite),
  [Vitest guide](https://main.vitest.dev/guide/).

### Run the Express service on loopback only

- **Decision**: Use Node.js and Express 5 for activity/API operations. Bind the
  HTTP and WebSocket service to `127.0.0.1`, not `0.0.0.0` or a LAN interface.
- **Rationale**: It supports persistent activity state and WebSocket updates
  while preserving the spec's local simulation/no other-device server scope.
  Express 5 forwards thrown errors and rejected async handlers to error
  middleware; add an explicit sanitized handler rather than returning raw
  errors or relying on development stack traces.
- **Alternatives considered**: A remote service conflicts with the spec's
  local-only scope; an in-memory frontend state cannot satisfy refresh recovery.
- **Sources**: [Express error handling](https://expressjs.com/en/guide/error-handling/),
  [Express middleware](https://expressjs.com/en/guide/writing-middleware/).

### Run the TypeScript service during local development

- **Decision**: Use Node's `--watch` and `--env-file=../.env` options with
  `--import tsx` in the server workspace's development script. This runs the
  TypeScript Express service and loads root environment settings into
  `process.env` without a separate dotenv package.
- **Rationale**: This avoids maintaining a second development-only compile/run
  pipeline while preserving plain compiled JavaScript for production builds.
  The `tsx` project provides TypeScript execution and is MIT licensed.
- **Alternatives considered**: Compile-on-change plus a separate process
  supervisor adds configuration; adding a framework-specific server is outside
  the chosen stack.
- **Sources**: [`tsx` project](https://github.com/privatenumber/tsx),
  [`tsx` MIT license](https://github.com/privatenumber/tsx/blob/master/LICENSE),
  [Node.js environment variables](https://nodejs.org/dist/latest/docs/api/environment_variables.html).

### Use SQLite as the authoritative activity store

- **Decision**: Store activities, groups, and simulated session restoration
  records in SQLite through `better-sqlite3`. Enforce unique
  `(activity_id, normalized_name)` and perform group insert plus membership/
  phase checks in a short transaction.
- **Rationale**: SQLite supports composite uniqueness constraints and serializes
  concurrent write transactions, which fits one local service and prevents
  duplicate enrollment races. The `better-sqlite3` project documents full
  transaction support, a synchronous API suited to this low-volume local app,
  prebuilt binaries for major platforms/architectures, and an MIT license. Keep
  database calls short to avoid blocking the Node event loop. The database is
  the source of truth for reads after refresh/reconnect.
- **Alternatives considered**: Browser memory cannot recover after refresh;
  SQLite plus a remote database would exceed current scope; introducing an ORM
  is unnecessary for this small schema.
- **Source**: [SQLite transactions](https://www.sqlite.org/lang_transaction.html),
  [SQLite CREATE TABLE constraints](https://www.sqlite.org/lang_createtable.html),
  [`better-sqlite3` project](https://github.com/WiseLibs/better-sqlite3),
  [`better-sqlite3` MIT license](https://github.com/WiseLibs/better-sqlite3/blob/master/LICENSE).

### Publish committed phase changes using WebSocket

- **Decision**: Use the browser's native WebSocket client and a Node-side
  WebSocket server implementation such as `ws`. Persist phase changes first,
  then broadcast an event containing activity id, phase, and monotonic revision.
  On reconnect, fetch current state through the API; ignore events older than a
  view's current revision.
- **Rationale**: This maps to the PlantUML synchronization-notification
  component and prevents lost or stale events from becoming authoritative.
  `ws` documents server-side WebSocket support and browser-compatible
  connections use the browser's native implementation. The package is MIT
  licensed and must be recorded in dependency attribution.
- **Alternatives considered**: Periodic polling adds delay and unnecessary
  requests; frontend-only events cannot synchronize independent views.
- **Sources**: [`ws` project](https://github.com/websockets/ws),
  [`ws` API](https://github.com/websockets/ws/blob/master/doc/ws.md),
  [MIT license](https://github.com/websockets/ws/blob/master/LICENSE).

### Use Vitest for behavior and integration tests

- **Decision**: Use Vitest for unit, API, SQLite, and WebSocket tests. Keep
  tests for successful activity/joins and boundary cases such as duplicate
  groups, invalid phase transitions, answer visibility, and refresh recovery.
- **Rationale**: Vitest aligns with the selected Vite stack and documents the
  Node and Vite minimums recorded above. Use a temporary SQLite database per
  integration-test run so test state does not leak into the local app database.
- **Alternative considered**: A second test runner would add an unneeded
  dependency and configuration surface.
- **Source**: [Vitest guide](https://main.vitest.dev/guide/).

### Support all-state role changes and preserve activity data

- **Decision**: Make `返回角色選擇` available throughout every teacher and
  student flow after role selection. Atomically clear and retire only the
  session that initiated the action. When that session belongs to a teacher,
  leave the activity phase and all other student sessions unchanged; do not
  end the activity or hand off control. Clear the old session's
  `activity_id` and `group_id`
  and set its `retired_at`; the browser then removes its old session id. Retired
  sessions cannot be restored or used for activity operations. A newly selected
  role creates a new active session. Keep the role on the retired record as
  historical data only. Unavailable-activity state and recovery are specified
  by FR-014 but deferred outside `codex/005`; they require a later data-lifecycle
  decision and implementation.
- **Rationale**: Resetting only the initiating session prevents a user changing
  roles from unexpectedly disrupting connected students or changing the
  classroom phase. Keeping the activity record also preserves group-name
  uniqueness and its historical creator reference. A future unavailable state
  instead of physically deleting an activity avoids the existing foreign-key
  cascade deleting its groups; that state is deferred outside `codex/005`.
  Retiring the
  session clears the prior active role/context without deleting a teacher
  session referenced by `activities.created_by_session_id`. Retaining the group
  row preserves the user's chosen behavior and activity-scoped name uniqueness.
  Clearing only browser storage would leave server-side state active.
- **Failure handling**: If the session is already missing, the client may
  discard the invalid local id and return to role selection. If the service is
  reachable but a reset fails, keep the current flow available and explain
  that it can be retried; do not report a successful reset before the database
  update completes.
- **Alternatives considered**: Automatically ending the activity would change
  the shared phase and disrupt students; handing off control would introduce
  ownership-transfer behavior outside this feature. Physically deleting the
  activity cascades to its groups; deleting the old session can break activity
  ownership references; clearing only local storage would leave server-side
  context active.

### Defer Google Sheets access to a later subfeature

- **Decision**: Do not add Sheets endpoints, database fields, Google credentials,
  or API dependencies to `001-user-stage-sync`. Design the integration in a
  separate subfeature after specifying which data it reads or writes.
- **Rationale**: The user chose this option during clarification. The current
  feature has no Sheets data contract. Keeping SQLite authoritative avoids an
  undefined second source of truth.
- **Security constraints for that later feature**: Use Google's official Node
  client, request the narrowest suitable scope, keep credentials server-side
  and in environment variables only, never copy the quickstart's credential
  file into the repository, and redact tokens/private keys from logs. The
  selected auth flow must match the later data contract and spreadsheet owner.
- **Sources**: [Google Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes),
  [OAuth 2.0 overview](https://developers.google.com/identity/protocols/oauth2/),
  [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server),
  [Google Sheets Node quickstart](https://developers.google.com/workspace/sheets/api/quickstart/nodejs).

### Keep configuration and logs free of secret values

- **Decision**: The root `.env.example` contains local non-secret settings only;
  the root `.gitignore` excludes `.env`. Never log environment contents,
  credentials, auth headers, request bodies that may contain credentials, or
  raw error details from external services.
- **Rationale**: This enforces the project constitution and the user's explicit
  log constraint. When Sheets is introduced, add only its variable names and
  safe empty placeholders in `.env.example`.
- **Source**: [Node.js environment variables](https://nodejs.org/dist/latest/docs/api/environment_variables.html).

## Open Items

- The purpose and data contract for Google Sheets belong to a later subfeature;
  no Sheets behavior remains unresolved for this feature.
- Record all selected package names, sources, and licenses in
  `THIRD_PARTY_NOTICES.md` during implementation bootstrap; add attribution for
  packages introduced later.
