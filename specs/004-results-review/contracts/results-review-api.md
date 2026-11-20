# API Contract: 結果檢視與檢討

All routes use the existing local session header `X-Local-Session-Id`. The API is JSON over the existing Express service. The client must not infer authorization from UI state; routes validate role, current activity/group membership, activity identity, and phase.

## Existing student final results

`GET /api/activities/{activityId}/answer-status`

The existing route remains the student result source and winner-status source. Its ended response includes one `WinningAnswerResult` for each imported question, using the winning submission only; unanswered questions return `winner: false`.

| Phase | Joined student response |
|---|---|
| `準備中` | `{ "phase": "準備中", "items": [] }` |
| `搶答進行中` | Own accepted question numbers only; no group, answer, rank, or winner details |
| `已結束` | Complete winner/no-winner results for the imported question list |

The student UI renders the results view only after `已結束`. If the student's session has joined a newer activity, authorization to the old activity is denied. A session not switched to another activity may still inspect the old result.

## Teacher full review records

`GET /api/teacher/activities`

Returns activities owned by the current teacher session, including phase and creation time, ordered newest first. This list lets the teacher select a prior ended activity after creating a new activity. It contains no answer or submission data. Non-teachers receive `403 TEACHER_REQUIRED`.

```json
{
  "activities": [
    { "activityId": "old-activity-id", "phase": "已結束", "createdAt": "2026-11-20T12:00:00.000Z" },
    { "activityId": "current-activity-id", "phase": "搶答進行中", "createdAt": "2026-11-20T12:10:00.000Z" }
  ]
}
```

The review UI enables opening full records only for ended activities.

`GET /api/activities/{activityId}/review-records`

Owner teacher only. This route requires the activity phase `已結束`; it returns all first-valid-per-group/question submissions, including non-winners submitted after another group has won. Records are sorted by question number, then `submissionRank`.

### Success response

```json
{
  "activityId": "activity-id",
  "phase": "已結束",
  "questions": [
    {
      "questionNumber": 1,
      "unanswered": false,
      "records": [
        {
          "submissionRank": 1,
          "groupId": "group-a",
          "groupName": "Blue",
          "answerParts": ["answer one", "answer two"],
          "isWinner": true
        },
        {
          "submissionRank": 2,
          "groupId": "group-b",
          "groupName": "Green",
          "answerParts": ["another answer", "second part"],
          "isWinner": false
        }
      ]
    },
    { "questionNumber": 2, "unanswered": true, "records": [] }
  ]
}
```

`answerParts` preserves blank order. `submissionRank` starts at 1 independently for each question. A question with no submissions is included exactly once with `unanswered: true` and an empty `records` array.

### Errors

| Condition | Status | Code | Behavior |
|---|---:|---|---|
| Missing/invalid session header | 400 | `SESSION_REQUIRED` | Clear local-session instruction; no records |
| Unknown activity | 404 | `ACTIVITY_NOT_FOUND` | No activity details or records |
| Caller is not owner teacher | 403 | `ACTIVITY_OWNER_REQUIRED` | No records |
| Activity has not ended | 409 | `BUZZER_NOT_ENDED` | No records |
| Persisted record or rank consistency failure | 409 | `REVIEW_RECORDS_INVALID` | No partial history |

Error bodies do not echo submitted answers or other groups' details. No new WebSocket message is defined for review history; the client reads the persisted result snapshot after end.
