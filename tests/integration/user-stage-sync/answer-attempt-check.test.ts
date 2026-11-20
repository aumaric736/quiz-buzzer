import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { checkAnswerAttempt } from '../../../server/src/features/user-stage-sync/application/answer-phase-guard.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('answer phase guard', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let studentId: string;
  let activityId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentId = createSession(db, 'student').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    db.prepare('INSERT INTO groups (id, activity_id, display_name, normalized_name, joined_at) VALUES (?, ?, ?, ?, ?)').run('group-1', activityId, 'Blue', 'blue', new Date().toISOString());
    db.prepare('UPDATE user_sessions SET activity_id = ?, group_id = ? WHERE id = ?').run(activityId, 'group-1', studentId);
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function check(body?: unknown) {
    return fetch(`${baseUrl}/api/activities/${activityId}/answer-attempt-check`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentId },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  it('permits the live phase without creating or accepting answer data', async () => {
    seedGuidedNotesQuestions(db, activityId);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    expect(checkAnswerAttempt(db, studentId, activityId)).toEqual({ allowed: true });
    const response = await check({});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ allowed: true });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%answer%'").all()).toEqual([]);
  });

  it('rejects preparation and ended attempts with phase-specific errors and rejects answer payloads', async () => {
    const before = await check();
    expect(before.status).toBe(409);
    expect(await before.json()).toMatchObject({ code: 'ANSWER_NOT_STARTED' });
    expect((await check({ answer: 'secret answer' })).status).toBe(400);
    seedGuidedNotesQuestions(db, activityId);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    transitionActivity(db, teacherId, activityId, '已結束');
    const after = await check();
    expect(after.status).toBe(409);
    expect(await after.json()).toMatchObject({ code: 'ANSWER_ACTIVITY_ENDED' });
    expect(db.prepare('SELECT count(*) AS total FROM groups').get()).toEqual({ total: 1 });
  });
});
