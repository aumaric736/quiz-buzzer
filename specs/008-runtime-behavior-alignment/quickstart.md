# Quickstart: 小組加入、即時作答檢視與學習單匯入

## Prerequisites

- Node.js `>=22.12` and installed npm workspace dependencies.
- A teacher session, several student sessions, and an activity.
- A Guided Notes source supported by feature 002; test the original single-question template and one conforming variant.
- Each imported question has at least one answer mapping with zero-based contiguous slot indexes before the teacher can open joining.

## Start the application

In separate PowerShell windows from the repository root:

```powershell
npm.cmd run dev --workspace=server
npm.cmd run dev --workspace=client
```

Open the Vite URL printed by the client command.

## Validate worksheet editing and the explicit opening lock

1. In `準備中`, import the original template without adding markers. Confirm the detected source number, mapping, and order; use the `題目` column to recognize question structure without storing/displaying its prompt text.
2. Before opening joining, import a conforming variant with moved/reordered columns, a different question count, instruction rows, and blank separators. Confirm unique source numbers and physical document order are persisted and retained (for example, worksheet order `5, 1, 3` remains `5, 1, 3`, not numeric order) in student question lists, team answer snapshots, teacher progress, and final results; answer mapping slots remain zero-based/contiguous.
3. Try a question-structured row with a missing number, then a duplicate number. Each full import must fail with sheet/row diagnostics and leave no partial question or mapping changes. Blank separators must not be reported as missing numbers. Confirm the teacher can retry a corrected import because enrollment is not open yet.
4. Try a layout that cannot be uniquely recognized. Expect a structural diagnostic and no partial changes.
5. With no ready questions or invalid mappings, try `開放加入`; expect rejection and keep student enrollment closed. With a ready question set, invoke `開放加入`; confirm the activity stays in `準備中`, the question set becomes immutable, and students can join.
6. After opening joining but before any student joins, try replacing the worksheet or editing the question list. Both must be rejected and leave the committed question set/mappings unchanged.
7. Confirm the student team-formation screen remains in its current mode and has no newly added total-question-count or question-content preview.

## Validate migration 009 compatibility

1. Upgrade a database containing a `準備中` activity with an assigned, non-retired student membership and a ready question/mapping set. Confirm `joining_opened_at` is backfilled and the existing question set is treated as locked for team formation.
2. Upgrade a database containing a `準備中` activity with an assigned student but no questions or incomplete mappings. Confirm `joining_opened_at` remains null, existing membership is preserved, the teacher can complete the worksheet, and no new student can join before the teacher opens joining.
3. Upgrade a database containing a `準備中` activity with no assigned student membership. Confirm `joining_opened_at` remains null and students cannot join until the teacher explicitly opens joining.
4. Upgrade a database containing an active student session with non-null `disconnected_until`. Confirm `disconnected_at` is populated from that session's `updated_at`, the session is counted offline, and its existing group/role association is preserved for recovery. Confirm migration 005 is unchanged.
5. Upgrade a database containing existing question rows. Confirm `display_order` is backfilled contiguously in ascending source-question-number order, matching the former presentation.

## Validate phase-based joining and recovery

1. Before joining is opened, try student enrollment; expect a clear rejection. After opening, join students up to the two-online-member limit. Confirm the teacher roster shows `額滿` at two online members and does not expose a numeric capacity/seat count.
2. Close one connection cleanly during team formation. Confirm immediate offline classification/count decrease, the roster changes from `額滿` to `開放加入`, and the vacancy is released. For an unclean drop, confirm it remains online until 30 consecutive seconds without heartbeat, then becomes offline; measure the two-second render target from commit.
3. Reconnect during team formation while the original group has a vacancy and confirm original-role recovery. Repeat after another student occupies the vacancy; expect a full notice and normal selection of another available group.
4. Start answering. Confirm roster status is `停止加入` even after a member disconnects. Reject new enrollment; reconnect an existing member after more than 30 seconds and confirm original group/role recovery.
5. End the activity. Reject join, reconnect, and answer operations. Confirm teacher and feature-004-authorized students retain read-only result review.

## Validate teacher live answer progress and privacy

1. Open a teacher activity view and student views for two groups. Submit a valid answer from one group. Confirm the teacher sees the question's answered count / total current group count, that group marked answered with answer and rank, and the other group marked unanswered.
2. Make a second group submit its first valid answer after a winner exists. Confirm it receives the next rank without replacing the winner. Invalid and repeated submissions must not change counts/ranks.
3. Confirm presence and answer progress render within two seconds of committed state at the 100-group/200-session target, without reload. Offline groups remain in the total-group denominator.
4. Confirm students do not receive other groups' active answer status, answer content, or ranks. Confirm ended results follow feature 004 authorization and stable ranking.
5. Check teacher roster names of different lengths; online counts stay aligned and no seat/occupied/capacity figures appear.

## Automated checks for implementation

```powershell
npm.cmd test
npm.cmd run build
```

Focused coverage should exercise import parsing/atomic failure/pre-open retry/opening lock, source-number versus mapping-slot handling, join/presence boundaries, teacher progress/rank/privacy, and rendered realtime capacity. Record exact command results during implementation; this planning step does not claim checks have run.

## Implementation verification record

- `npm.cmd test`: passed, 69 test files and 216 tests.
- `npm.cmd run build`: passed for shared, server, and client workspaces; Vite production bundle built successfully.
- `npm.cmd test -- tests/integration/user-stage-sync/live-team-capacity.test.ts tests/integration/user-stage-sync/phase-aware-presence.test.ts`: passed, 2 files and 6 tests. The capacity scenario exercises the 100-group/200-session view and asserts committed-state rendering under two seconds; the presence scenario checks immediate clean-close classification and the 30-second unclean-heartbeat threshold.
- `git diff --check`: passed.
- Automated scenarios also cover atomic worksheet replacement/rollback and retry, opening lock, source row order, display-order result review, teacher progress and rank, and student answer privacy.
