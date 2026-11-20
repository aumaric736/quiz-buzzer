import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('student final results', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let studentAId: string;
  let studentBId: string;
  let outsiderId: string;
  let activityId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentAId = createSession(db, 'student').sessionId;
    studentBId = createSession(db, 'student').sessionId;
    outsiderId = createSession(db, 'student').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [2, 5], 2);
    enrollGroup(db, studentAId, activityId, 'Blue Team');
    enrollGroup(db, studentBId, activityId, 'Green Team');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  function readStatus(sessionId: string, targetActivityId = activityId) {
    return fetch(`${baseUrl}/api/activities/${targetActivityId}/answer-status`, {
      headers: { 'X-Local-Session-Id': sessionId }
    });
  }

  it('shows only own submitted question numbers while live, then one winner/no-winner row per imported question', async () => {
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const answer = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentAId },
      body: JSON.stringify({ questionNumber: 2, answerParts: ['first', 'second'] })
    });
    expect(answer.status).toBe(201);

    expect(await (await readStatus(studentAId)).json()).toEqual({
      phase: '搶答進行中', items: [{ questionNumber: 2, status: 'submitted' }]
    });
    expect(await (await readStatus(studentBId)).json()).toEqual({ phase: '搶答進行中', items: [] });

    transitionActivity(db, teacherId, activityId, '已結束');
    expect(await (await readStatus(studentBId)).json()).toEqual({
      phase: '已結束', items: [
        { questionNumber: 2, winner: true, winningGroupName: 'Blue Team', winningGroupId: expect.any(String), answerParts: ['first', 'second'] },
        { questionNumber: 5, winner: false }
      ]
    });
    const outsider = await readStatus(outsiderId);
    expect(outsider.status).toBe(403);
    expect(await outsider.json()).toMatchObject({ code: 'ACTIVITY_MEMBERSHIP_REQUIRED' });
  });

  it('keeps old results teacher-owned and starts a new activity without inherited submissions', async () => {
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const answer = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentAId },
      body: JSON.stringify({ questionNumber: 2, answerParts: ['old', 'answer'] })
    });
    expect(answer.status).toBe(201);
    transitionActivity(db, teacherId, activityId, '已結束');

    const newActivityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, newActivityId, [2, 5], 2);
    const joinNewActivity = await fetch(`${baseUrl}/api/activities/${newActivityId}/groups`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentAId },
      body: JSON.stringify({ groupName: 'Blue Team New Run' })
    });
    expect(joinNewActivity.status).toBe(201);

    const formerStudentAccess = await readStatus(studentAId);
    expect(formerStudentAccess.status).toBe(403);
    expect(await formerStudentAccess.json()).toMatchObject({ code: 'ACTIVITY_MEMBERSHIP_REQUIRED' });

    transitionActivity(db, teacherId, newActivityId, '搶答進行中');
    transitionActivity(db, teacherId, newActivityId, '已結束');
    expect(await (await readStatus(studentAId, newActivityId)).json()).toEqual({
      phase: '已結束', items: [
        { questionNumber: 2, winner: false },
        { questionNumber: 5, winner: false }
      ]
    });
    const oldResults = await (await readStatus(teacherId, activityId)).json() as { items: Array<Record<string, unknown>> };
    expect(oldResults.items).toHaveLength(2);
    expect(oldResults.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ questionNumber: 2, winningGroupName: 'Blue Team', answerParts: ['old', 'answer'] }),
      { questionNumber: 5, winner: false }
    ]));
  });
});
