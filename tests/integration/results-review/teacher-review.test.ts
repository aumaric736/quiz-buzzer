import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('teacher submission review API', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let otherTeacherId: string;
  let studentIds: string[];
  let activityId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    otherTeacherId = createSession(db, 'teacher').sessionId;
    studentIds = [createSession(db, 'student').sessionId, createSession(db, 'student').sessionId];
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [2, 5, 9], 1);
    db.prepare('UPDATE activity_questions SET display_order = CASE question_number WHEN 5 THEN 0 WHEN 2 THEN 1 ELSE 2 END WHERE activity_id = ?').run(activityId);
    enrollGroup(db, studentIds[0], activityId, 'Blue Team');
    enrollGroup(db, studentIds[1], activityId, 'Green Team');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  function review(sessionId: string, targetActivityId = activityId) {
    return fetch(`${baseUrl}/api/activities/${targetActivityId}/review-records`, {
      headers: { 'X-Local-Session-Id': sessionId }
    });
  }

  it('returns every valid submission in per-question rank order only to the owner after end', async () => {
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const postAnswer = (sessionId: string, questionNumber: number, answerParts: string[]) => fetch(
      `${baseUrl}/api/activities/${activityId}/answers`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId },
        body: JSON.stringify({ questionNumber, answerParts })
      }
    );
    expect((await postAnswer(studentIds[0], 2, ['winner'])).status).toBe(201);
    expect((await postAnswer(studentIds[1], 2, ['later'])).status).toBe(201);
    expect((await postAnswer(studentIds[1], 5, ['first on five'])).status).toBe(201);

    const beforeEnd = await review(teacherId);
    expect(beforeEnd.status).toBe(409);
    expect(await beforeEnd.json()).toMatchObject({ code: 'BUZZER_NOT_ENDED' });
    transitionActivity(db, teacherId, activityId, '已結束');

    const first = await review(teacherId);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody).toEqual({
      activityId, phase: '已結束', questions: [
        { questionNumber: 5, unanswered: false, records: [
          { submissionRank: 1, groupId: expect.any(String), groupName: 'Green Team', answerParts: ['first on five'], isWinner: true }
        ] },
        { questionNumber: 2, unanswered: false, records: [
          { submissionRank: 1, groupId: expect.any(String), groupName: 'Blue Team', answerParts: ['winner'], isWinner: true },
          { submissionRank: 2, groupId: expect.any(String), groupName: 'Green Team', answerParts: ['later'], isWinner: false }
        ] },
        { questionNumber: 9, unanswered: true, records: [] }
      ]
    });
    expect(await (await review(teacherId)).json()).toEqual(firstBody);

    const nonOwner = await review(otherTeacherId);
    expect(nonOwner.status).toBe(403);
    expect(await nonOwner.json()).toMatchObject({ code: 'ACTIVITY_OWNER_REQUIRED' });
    const student = await review(studentIds[0]);
    expect(student.status).toBe(403);
    expect(await student.json()).toMatchObject({ code: 'ACTIVITY_OWNER_REQUIRED' });
  });
});
