# Teacher Activity Controls Contract

The teacher control is a UI contract over the existing `ActivitySnapshot`; it does not add an HTTP operation or a new persisted activity phase.

| Activity state | 「開始加入」 | 「開始答題」 |
|---|---|---|
| Activity created; joining not opened | Visible and enabled unless an operation is in progress | Visible and disabled |
| Joining open; activity still `準備中` | Visible and disabled | Visible and enabled unless an operation is in progress |
| Activity is `搶答進行中` | Visible and disabled | Visible and disabled; preserve existing 「結束活動」 control separately |
| Activity is `已結束` | Visible and disabled | Visible and disabled; preserve existing new-activity action |

Both buttons remain visible side by side and neither is hidden or replaced. Use the existing `POST /api/activities/:activityId/open-joining` and `POST /api/activities/:activityId/phase` operations and their returned snapshots. Preserve teacher ownership, question readiness, error messages, and busy-state behavior. During an operation, disable both buttons to prevent duplicate submissions.
