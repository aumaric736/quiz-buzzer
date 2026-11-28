import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('activity API', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = createTestDatabase();
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function post(path: string, sessionId: string, body: unknown) {
    return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(body) });
  }

  it('creates a preparation activity and transitions it through the allowed lifecycle', async () => {
    const teacher = createSession(db, 'teacher');
    const startedAt = performance.now();
    const created = await post('/api/activities', teacher.sessionId, {});
    expect(performance.now() - startedAt).toBeLessThan(30_000);
    expect(created.status).toBe(201);
    const activity = await created.json() as { activityId: string; phase: string; revision: number };
    expect(activity).toMatchObject({ phase: '準備中', revision: 0 });
    seedGuidedNotesQuestions(db, activity.activityId);
    expect((await post(`/api/activities/${activity.activityId}/open-joining`, teacher.sessionId, {})).status).toBe(200);
    expect(db.prepare('SELECT activity_id FROM user_sessions WHERE id = ?').get(teacher.sessionId)).toEqual({ activity_id: activity.activityId });
    expect((await fetch(`${baseUrl}/api/activities/${activity.activityId}`, { headers: { 'X-Local-Session-Id': teacher.sessionId } })).status).toBe(200);
    expect((await post(`/api/activities/${activity.activityId}/phase`, teacher.sessionId, { phase: '搶答進行中' })).status).toBe(200);
    const ended = await post(`/api/activities/${activity.activityId}/phase`, teacher.sessionId, { phase: '已結束' });
    expect(await ended.json()).toMatchObject({ phase: '已結束', revision: 2 });
  });

  it('rejects unauthorized and invalid transitions without changing SQLite state', async () => {
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    const created = await post('/api/activities', teacher.sessionId, {});
    const activity = await created.json() as { activityId: string };
    for (const [sessionId, phase] of [[student.sessionId, '搶答進行中'], [teacher.sessionId, '已結束'], [teacher.sessionId, 'invalid'], [teacher.sessionId, '']] as const) {
      const response = await post(`/api/activities/${activity.activityId}/phase`, sessionId, { phase });
      expect(response.status).toBe(phase === '搶答進行中' && sessionId === student.sessionId ? 403 : 409);
      expect(await response.json()).toHaveProperty('message');
    }
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activity.activityId)).toEqual({ phase: '準備中', revision: 0 });
    expect((await post('/api/activities', student.sessionId, {})).status).toBe(403);
  });

  it('ends the activity when the teacher explicitly leaves while preserving student membership', async () => {
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    const created = await post('/api/activities', teacher.sessionId, {});
    const activity = await created.json() as { activityId: string };
    seedGuidedNotesQuestions(db, activity.activityId);
    expect((await post(`/api/activities/${activity.activityId}/open-joining`, teacher.sessionId, {})).status).toBe(200);
    const joined = await post(`/api/activities/${activity.activityId}/groups`, student.sessionId, { groupName: 'Green Team' });
    expect(joined.status).toBe(201);
    await post(`/api/activities/${activity.activityId}/phase`, teacher.sessionId, { phase: '搶答進行中' });
    const studentBefore = db.prepare('SELECT role, activity_id, group_id, retired_at FROM user_sessions WHERE id = ?').get(student.sessionId);
    const activityBefore = db.prepare('SELECT phase, revision, updated_at FROM activities WHERE id = ?').get(activity.activityId);

    const reset = await fetch(`${baseUrl}/api/sessions/${teacher.sessionId}/reset-context`, { method: 'POST' });
    expect(reset.status).toBe(200);
    expect(await reset.json()).toMatchObject({ status: 'retired', activityId: null, groupId: null });
    expect(db.prepare('SELECT role, activity_id, group_id, retired_at FROM user_sessions WHERE id = ?').get(student.sessionId)).toEqual(studentBefore);
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activity.activityId)).toEqual({ phase: '已結束', revision: 2 });
    expect(db.prepare('SELECT activity_id, group_id, retired_at FROM user_sessions WHERE id = ?').get(teacher.sessionId))
      .toMatchObject({ activity_id: null, group_id: null, retired_at: expect.any(String) });

    const studentSnapshot = await fetch(`${baseUrl}/api/activities/${activity.activityId}`, { headers: { 'X-Local-Session-Id': student.sessionId } });
    expect(studentSnapshot.status).toBe(200);
    expect(await studentSnapshot.json()).toMatchObject({ phase: '已結束', revision: 2 });
    const retiredTeacherOperation = await post(`/api/activities/${activity.activityId}/phase`, teacher.sessionId, { phase: '已結束' });
    expect(retiredTeacherOperation.status).toBe(404);
    expect(await retiredTeacherOperation.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

});
