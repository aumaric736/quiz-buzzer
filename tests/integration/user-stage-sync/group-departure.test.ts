import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { expireStudentSession, markStudentDisconnected } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { createTestDatabase } from '../../helpers/sqlite.js';

describe('group departure', () => {
  let db: SqliteDatabase; let server: Server; let baseUrl: string; let activityId: string;
  beforeEach(async () => {
    db = createTestDatabase();
    const teacher = createSession(db, 'teacher'); activityId = createActivity(db, teacher.sessionId).activityId;
    server = createApp(db).listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); db.close(); });
  const enroll = (sessionId: string, body: unknown) => fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(body) });
  const leave = (sessionId: string) => fetch(`${baseUrl}/api/sessions/${sessionId}/reset-context`, { method: 'POST' });

  it('closes new joins when the leader leaves while the existing member remains active', async () => {
    const leader = createSession(db, 'student');
    const group = await (await enroll(leader.sessionId, { mode: 'leader', groupName: 'Leaving Leader' })).json() as { inviteCode: string; groupId: string };
    const member = createSession(db, 'student'); await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    await leave(leader.sessionId);
    expect(db.prepare('SELECT accepts_members FROM groups WHERE id = ?').get(group.groupId)).toEqual({ accepts_members: 0 });
    expect((await fetch(`${baseUrl}/api/sessions/${member.sessionId}`)).status).toBe(200);
    const newcomer = createSession(db, 'student');
    expect((await enroll(newcomer.sessionId, { mode: 'member', inviteCode: group.inviteCode })).status).toBe(404);
  });

  it('frees a member seat on leave or expiry while the leader keeps the invite active', async () => {
    const leader = createSession(db, 'student');
    const group = await (await enroll(leader.sessionId, { mode: 'leader', groupName: 'Leaving Member' })).json() as { inviteCode: string; groupId: string };
    const member = createSession(db, 'student'); await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    await leave(member.sessionId);
    const replacement = createSession(db, 'student');
    expect((await enroll(replacement.sessionId, { mode: 'member', inviteCode: group.inviteCode })).status).toBe(201);
    markStudentDisconnected(db, leader.sessionId, new Date(Date.now() - 120_001));
    expireStudentSession(db, leader.sessionId, new Date());
    expect(db.prepare('SELECT accepts_members FROM groups WHERE id = ?').get(group.groupId)).toEqual({ accepts_members: 0 });
    expect(db.prepare('SELECT retired_at FROM user_sessions WHERE id = ?').get(replacement.sessionId)).toEqual({ retired_at: null });
  });

  it('frees a member seat when that member session expires', async () => {
    const leader = createSession(db, 'student');
    const group = await (await enroll(leader.sessionId, { mode: 'leader', groupName: 'Member Timeout' })).json() as { inviteCode: string };
    const member = createSession(db, 'student'); await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    markStudentDisconnected(db, member.sessionId, new Date(Date.now() - 120_001));
    expireStudentSession(db, member.sessionId, new Date());
    const replacement = createSession(db, 'student');
    expect((await enroll(replacement.sessionId, { mode: 'member', inviteCode: group.inviteCode })).status).toBe(201);
  });
});
