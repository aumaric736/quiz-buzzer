# Quickstart: Teacher Control Layout

## Prerequisites

- Node.js version required by the repository (`>=22.12`).
- Dependencies installed from the repository root.

## Validation

Run the targeted teacher UI acceptance tests:

```bash
npx vitest run tests/acceptance/user-stage-sync/teacher-group-roster.test.tsx tests/acceptance/user-stage-sync/team-joining-open.test.tsx tests/acceptance/buzzer-flow/teacher-question-progress.test.tsx
```

Expected outcomes:

- The teacher roster includes the existing team name/code, online count, join status, and answer summary, but no leader online/offline label or replacement field; the name/code, online-count, and join-status columns use available width in a 2:1:1 ratio.
- In preparation, start controls remain in their existing positions and follow joining availability.
- In answering, both start controls are absent and 「結束答題」 occupies the former 「開始加入」 position.
- In the ended state, 「結束答題」 remains visible and disabled.
- Question progress lists with 1, 4, 5, or 8 items use four equal quarter-width slots per row; incomplete final rows retain blank slots and existing tiles keep their width.
- The existing empty-state message remains when no question progress is available.

For full repository validation, run:

```bash
npm test
```

See [teacher-ui.md](contracts/teacher-ui.md) for the complete visible-state contract and [data-model.md](data-model.md) for the unchanged data boundary.
