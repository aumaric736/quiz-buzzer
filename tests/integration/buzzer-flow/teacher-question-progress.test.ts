import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { markStudentDisconnected } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, enrollGroupForTest as enrollGroup, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('teacher per-question live progress', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let activityId: string;
  let groupIds: string[];

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [2, 5], 1);
    db.prepare('UPDATE activity_questions SET display_order = CASE question_number WHEN 5 THEN 0 ELSE 1 END WHERE activity_id = ?').run(activityId);
    groupIds = [];
    for (const name of ['Alpha', 'Offline', 'Gamma']) {
      const studentId = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, studentId, activityId, { mode: 'leader', groupName: name });
      groupIds.push(group.groupId);
      if (name === 'Offline') markStudentDisconnected(db, studentId);
    }
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  function getProgress(sessionId = teacherId) {
    return fetch(`${baseUrl}/api/activities/${activityId}/teacher-progress`, { headers: { 'X-Local-Session-Id': sessionId } });
  }

  async function submit(sessionId: string, questionNumber: number, answer: string) {
    return fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId },
      body: JSON.stringify({ questionNumber, answerParts: [answer] })
    });
  }

  it('counts every group including offline groups and returns ordered answered/unanswered details with saved answers and ranks', async () => {
    const alphaStudent = db.prepare('SELECT id FROM user_sessions WHERE group_id = ?').get(groupIds[0]) as { id: string };
    const gammaStudent = db.prepare('SELECT id FROM user_sessions WHERE group_id = ?').get(groupIds[2]) as { id: string };
    expect((await submit(gammaStudent.id, 5, 'first answer')).status).toBe(201);
    expect((await submit(alphaStudent.id, 5, 'later answer')).status).toBe(201);

    const response = await getProgress();
    expect(response.status).toBe(200);
    const body = await response.json() as { questions: Array<Record<string, unknown>> };
    expect(body.questions).toHaveLength(2);
    expect(body.questions[0]).toMatchObject({
      questionNumber: 5, displayOrder: 0, answeredGroupCount: 2, totalGroupCount: 3,
      answeredGroups: [
        { groupId: groupIds[2], groupName: 'Gamma', answerParts: ['first answer'], submissionRank: 1 },
        { groupId: groupIds[0], groupName: 'Alpha', answerParts: ['later answer'], submissionRank: 2 }
      ],
      unansweredGroups: [{ groupId: groupIds[1], groupName: 'Offline' }]
    });
    expect(body.questions[1]).toMatchObject({ questionNumber: 2, displayOrder: 1, answeredGroupCount: 0, totalGroupCount: 3 });
  });

  it('does not count invalid or repeated submissions and serves progress only to the authenticated activity owner', async () => {
    const alphaStudent = db.prepare('SELECT id FROM user_sessions WHERE group_id = ?').get(groupIds[0]) as { id: string };
    expect((await submit(alphaStudent.id, 5, 'valid')).status).toBe(201);
    expect((await submit(alphaStudent.id, 5, 'duplicate')).status).toBe(409);
    expect((await submit(alphaStudent.id, 2, '   ')).status).toBe(400);

    const progress = await getProgress();
    expect((await progress.json() as { questions: Array<{ answeredGroupCount: number; answeredGroups: Array<{ submissionRank: number }> }> })
      .questions[0]).toMatchObject({ answeredGroupCount: 1, answeredGroups: [{ submissionRank: 1 }] });

    const outsiderTeacher = createSession(db, 'teacher').sessionId;
    expect((await getProgress(outsiderTeacher)).status).toBe(403);
    expect((await getProgress(alphaStudent.id)).status).toBe(403);
  });
});
