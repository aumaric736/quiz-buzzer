import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, openActivityJoining, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { markStudentDisconnected } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('teacher group roster privacy', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let server: Server;
  let baseUrl: string;
  let activityId: string;
  let teacherId: string;
  beforeEach(async () => {
    db = createTestDatabase();
    const teacher = createSession(db, 'teacher'); teacherId = teacher.sessionId;
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId);
    openActivityJoining(db, teacherId, activityId);
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });
  it('returns online count and authoritative join state without seat or capacity details or student identity', async () => {
    const student = createSession(db, 'student');
    await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': student.sessionId }, body: JSON.stringify({ mode: 'leader', groupName: 'Secret Name' }) });
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { headers: { 'X-Local-Session-Id': teacherId } });
    const body = await response.json() as { items: Array<Record<string, unknown>> };
    expect(body.items).toHaveLength(1);
    expect(Object.keys(body.items[0]!).sort()).toEqual(['displayName', 'groupId', 'inviteCode', 'joinStatus', 'onlineCount']);
    expect(body.items[0]).toMatchObject({ displayName: 'Secret Name', onlineCount: 1, joinStatus: '開放加入' });
    expect(body).not.toHaveProperty('sessionId');
    expect(JSON.stringify(body)).toContain('Secret Name');
    expect(JSON.stringify(body)).not.toContain(student.sessionId);
    expect(JSON.stringify(body)).not.toMatch(/occupiedCount|activeSessionCount|capacity|seat|席位/);
  });

  it('updates join state from unavailable to open, full, open after departure, stopped, then unavailable', async () => {
    const leader = createSession(db, 'student');
    const created = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': leader.sessionId },
      body: JSON.stringify({ mode: 'leader', groupName: 'Status Team' }) });
    expect(created.status).toBe(201);
    const group = await created.json() as { inviteCode: string };
    const roster = async () => (await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { headers: { 'X-Local-Session-Id': teacherId } })).json() as
      Promise<{ items: Array<{ displayName: string; onlineCount: number; joinStatus: string }> }>;

    db.prepare('UPDATE activities SET joining_opened_at = NULL WHERE id = ?').run(activityId);
    expect((await roster()).items[0]).toMatchObject({ joinStatus: '不可用', onlineCount: 1 });
    openActivityJoining(db, teacherId, activityId);
    expect((await roster()).items[0]).toMatchObject({ joinStatus: '開放加入', onlineCount: 1 });

    const member = createSession(db, 'student');
    const joined = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': member.sessionId },
      body: JSON.stringify({ mode: 'member', inviteCode: group.inviteCode }) });
    expect(joined.status).toBe(201);
    expect((await roster()).items[0]).toMatchObject({ joinStatus: '額滿', onlineCount: 2 });

    markStudentDisconnected(db, member.sessionId);
    expect((await roster()).items[0]).toMatchObject({ joinStatus: '開放加入', onlineCount: 1 });
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    expect((await roster()).items[0]).toMatchObject({ joinStatus: '停止加入', onlineCount: 1 });
    transitionActivity(db, teacherId, activityId, '已結束');
    expect((await roster()).items[0]).toMatchObject({ joinStatus: '不可用', onlineCount: 1 });
  });

  it('reports unavailable when the worksheet mappings are not ready even if the gate timestamp exists', async () => {
    const leader = createSession(db, 'student');
    await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': leader.sessionId },
      body: JSON.stringify({ mode: 'leader', groupName: 'Not Ready' }) });
    db.prepare('UPDATE activities SET joining_opened_at = updated_at WHERE id = ?').run(activityId);
    db.prepare('UPDATE guided_notes_blank_mappings SET slot_order = 4 WHERE activity_id = ?').run(activityId);
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { headers: { 'X-Local-Session-Id': teacherId } });
    expect(await response.json()).toMatchObject({ items: [{ joinStatus: '不可用' }] });
  });
});
