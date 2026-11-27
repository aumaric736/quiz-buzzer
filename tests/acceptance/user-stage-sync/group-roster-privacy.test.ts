import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createTestDatabase } from '../../helpers/sqlite.js';

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
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });
  it('returns only invite code and active session count without student identity fields', async () => {
    const student = createSession(db, 'student');
    await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': student.sessionId }, body: JSON.stringify({ mode: 'leader', groupName: 'Secret Name' }) });
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { headers: { 'X-Local-Session-Id': teacherId } });
    const body = await response.json() as { items: Array<Record<string, unknown>> };
    expect(body.items).toHaveLength(1);
    expect(Object.keys(body.items[0]!).sort()).toEqual(['acceptsMembers', 'activeSessionCount', 'capacity', 'groupId', 'inviteCode', 'occupiedCount', 'onlineCount']);
    expect(body.items[0]).toMatchObject({ onlineCount: 1, occupiedCount: 1, activeSessionCount: 1, capacity: 2, acceptsMembers: true });
    expect(body).not.toHaveProperty('sessionId');
    expect(JSON.stringify(body)).not.toContain('Secret Name');
    expect(JSON.stringify(body)).not.toContain(student.sessionId);
  });
});
