import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TeacherReviewRecordsResponse } from '../../../shared/src/results-review/contracts.js';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';
import { TeacherSubmissionReview } from '../../../client/src/features/results-review/components/TeacherSubmissionReview.js';

describe('teacher activity history acceptance', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let studentId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentId = createSession(db, 'student').sessionId;
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('lets the teacher reopen old records while a new activity starts with no inherited submissions', async () => {
    const oldActivityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, oldActivityId, [1], 1);
    enrollGroup(db, studentId, oldActivityId, 'Blue Team');
    transitionActivity(db, teacherId, oldActivityId, '搶答進行中');
    const answer = await fetch(`${baseUrl}/api/activities/${oldActivityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentId },
      body: JSON.stringify({ questionNumber: 1, answerParts: ['old answer'] })
    });
    expect(answer.status).toBe(201);
    transitionActivity(db, teacherId, oldActivityId, '已結束');

    const newActivityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, newActivityId, [1], 1);
    const list = await fetch(`${baseUrl}/api/teacher/activities`, { headers: { 'X-Local-Session-Id': teacherId } });
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ activities: [
      { activityId: newActivityId, phase: '準備中' },
      { activityId: oldActivityId, phase: '已結束' }
    ] });

    transitionActivity(db, teacherId, newActivityId, '搶答進行中');
    transitionActivity(db, teacherId, newActivityId, '已結束');
    const newRecords = await fetch(`${baseUrl}/api/activities/${newActivityId}/review-records`, {
      headers: { 'X-Local-Session-Id': teacherId }
    });
    expect(await newRecords.json()).toEqual({
      activityId: newActivityId, phase: '已結束', questions: [{ questionNumber: 1, unanswered: true, records: [] }]
    });

    const oldRecords = await fetch(`${baseUrl}/api/activities/${oldActivityId}/review-records`, {
      headers: { 'X-Local-Session-Id': teacherId }
    });
    expect(await oldRecords.json()).toMatchObject({
      activityId: oldActivityId, questions: [{ questionNumber: 1, records: [
        { submissionRank: 1, groupName: 'Blue Team', answerParts: ['old answer'], isWinner: true }
      ] }]
    });
  });

  it('renders ranked attempts and the explicit unanswered state in the teacher review', () => {
    const review: TeacherReviewRecordsResponse = {
      activityId: 'activity-review', phase: '已結束', questions: [
        { questionNumber: 2, unanswered: false, records: [
          { submissionRank: 1, groupId: 'group-blue', groupName: 'Blue Team', answerParts: ['first', 'winner'], isWinner: true },
          { submissionRank: 2, groupId: 'group-green', groupName: 'Green Team', answerParts: ['later', 'answer'], isWinner: false }
        ] },
        { questionNumber: 5, unanswered: true, records: [] }
      ]
    };
    const html = renderToStaticMarkup(<TeacherSubmissionReview review={review} />);
    expect(html).toContain('順位 1：Blue Team');
    expect(html).toContain('搶答成功');
    expect(html).toContain('順位 2：Green Team');
    expect(html).toContain('未勝出');
    expect(html).toContain('無人作答');
  });
});
