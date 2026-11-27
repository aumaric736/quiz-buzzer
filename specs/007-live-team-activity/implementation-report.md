# Implementation Report: 小組即時狀態與回寫

## Completed

- Added separate monotonic live revisions for activity roster and group state while retaining the existing activity phase revision.
- Added teacher-scoped roster and answer events, team-scoped member/answer events, and reconnect snapshots. Student answer data remains restricted to the student's own group.
- Displayed online and occupied-seat counts and each student's leader/member role. Teacher roster and same-team answer views update from live events.
- Added atomic preflight of every mapped worksheet target, including formulas with empty display values. Any occupied target blocks the full write batch and identifies the affected cells.
- Limited previews to five minutes and made expiration/occupied-cell recovery offer a new preview. Successful answer cells use `小組：{displayName}。回答：{answerPart}。`.
- Added two-minute session retirement, member seat release, leader group closure, revision updates, and local identity clearing after the server rejects an expired session. Expiry reconciliation commits before enrollment so a rejected same-deadline join cannot undo it; each affected team and activity is published, including expirations across activities.
- Added event-derived capacity acceptance using the same client state reducers as the teacher and student views. The test exercises group creation, the 200th enrollment, disconnect, expiry/seat release, and answer submission under 100 groups; it also removed duplicate teacher roster notifications on presence changes.

## Verification

| Check | Result |
|---|---|
| `npm.cmd test` | PASS — 62 test files, 189 tests |
| `npm.cmd run build` | PASS — shared, server, and client TypeScript builds; Vite production build |
| 100-group / 200-session realtime check | PASS — committed answer reached the teacher and both same-team screens, and rendered state stayed within two seconds |
| PlantUML render | PASS — all three feature PNGs regenerated with Eclipse Temurin JDK 17.0.21 |
| Error and logging review | PASS — API errors expose actionable messages; unexpected failures return a generic response; no reviewed path logs provider payloads or credentials |

## External integration note

The automated writeback scenarios use a fake Sheets gateway to verify target detection, formulas, atomic rejection, formatting, and expiry. A live Google Sheets write was not performed in this environment.
