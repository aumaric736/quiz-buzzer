import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createTestDatabase } from '../../helpers/sqlite.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createActivity, openActivityJoining } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { seedGuidedNotesQuestions } from '../../helpers/sqlite.js';
import type { Server } from 'node:http';

describe('session API', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = createTestDatabase();
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('creates student sessions and restores their null context', async () => {
    for (const role of ['student']) {
      const created = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role })
      });
      expect(created.status).toBe(201);
      const session = await created.json() as { sessionId: string; role: string };
      expect(session.role).toBe(role);
      const restored = await fetch(`${baseUrl}/api/sessions/${session.sessionId}`);
      expect(restored.status).toBe(200);
      expect(await restored.json()).toMatchObject({ sessionId: session.sessionId, role, activityId: null, groupId: null });
    }
  });

  it('rejects missing or unknown role values without creating a session', async () => {
    for (const body of [{}, { role: 'admin' }, { role: 3 }, { role: 'teacher' }, null]) {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      expect(response.status).toBe(body && typeof body === 'object' && 'role' in body && body.role === 'teacher' ? 403 : 400);
      expect(await response.json()).toHaveProperty('code');
    }
    expect(db.prepare('SELECT count(*) AS total FROM user_sessions').get()).toEqual({ total: 0 });
  });

  it('retires only the selected student session and preserves the group row and reserved name', async () => {
    const teacher = createSession(db, 'teacher');
    const studentResponse = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'student' })
    });
    const student = await studentResponse.json() as { sessionId: string };
    const activityResponse = await fetch(`${baseUrl}/api/activities`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacher.sessionId }, body: '{}'
    });
    const activity = await activityResponse.json() as { activityId: string };
    seedGuidedNotesQuestions(db, activity.activityId);
    openActivityJoining(db, teacher.sessionId, activity.activityId);
    const groupResponse = await fetch(`${baseUrl}/api/activities/${activity.activityId}/groups`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': student.sessionId }, body: JSON.stringify({ groupName: 'Blue Team' })
    });
    expect(groupResponse.status).toBe(201);
    const group = await groupResponse.json() as { groupId: string };

    const reset = () => fetch(`${baseUrl}/api/sessions/${student.sessionId}/reset-context`, { method: 'POST' });
    const retired = await reset();
    expect(retired.status).toBe(200);
    expect(await retired.json()).toMatchObject({ sessionId: student.sessionId, status: 'retired', activityId: null, groupId: null });
    expect(db.prepare('SELECT activity_id, group_id, retired_at FROM user_sessions WHERE id = ?').get(student.sessionId))
      .toMatchObject({ activity_id: null, group_id: null, retired_at: expect.any(String) });
    expect(db.prepare('SELECT id, activity_id, display_name, normalized_name FROM groups WHERE id = ?').get(group.groupId))
      .toEqual({ id: group.groupId, activity_id: activity.activityId, display_name: 'Blue Team', normalized_name: 'blue team' });
    expect(db.prepare('SELECT id FROM activities WHERE id = ?').get(activity.activityId)).toEqual({ id: activity.activityId });

    const restoreRetired = await fetch(`${baseUrl}/api/sessions/${student.sessionId}`);
    expect(restoreRetired.status).toBe(404);
    expect(await restoreRetired.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });
    const useRetired = await fetch(`${baseUrl}/api/activities/${activity.activityId}`, { headers: { 'X-Local-Session-Id': student.sessionId } });
    expect(useRetired.status).toBe(404);
    expect(await useRetired.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });

    const replacementResponse = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'student' })
    });
    const replacement = await replacementResponse.json() as { sessionId: string };
    const duplicateGroup = await fetch(`${baseUrl}/api/activities/${activity.activityId}/groups`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': replacement.sessionId }, body: JSON.stringify({ groupName: ' blue TEAM ' })
    });
    expect(duplicateGroup.status).toBe(409);
    expect(await duplicateGroup.json()).toMatchObject({ code: 'GROUP_NAME_TAKEN' });
    const retiredState = db.prepare('SELECT retired_at, updated_at FROM user_sessions WHERE id = ?').get(student.sessionId);
    expect((await reset()).status).toBe(200);
    expect(db.prepare('SELECT retired_at, updated_at FROM user_sessions WHERE id = ?').get(student.sessionId)).toEqual(retiredState);
  });

  it('returns SESSION_NOT_FOUND when asked to reset a missing session', async () => {
    const response = await fetch(`${baseUrl}/api/sessions/missing-session/reset-context`, { method: 'POST' });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('retires a fresh session without needing prior activity context', async () => {
    const created = await fetch(`${baseUrl}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'student' }) });
    const fresh = await created.json() as { sessionId: string };
    const response = await fetch(`${baseUrl}/api/sessions/${fresh.sessionId}/reset-context`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sessionId: fresh.sessionId, status: 'retired', activityId: null, groupId: null });
    expect((await fetch(`${baseUrl}/api/sessions/${fresh.sessionId}`)).status).toBe(404);
  });
});
