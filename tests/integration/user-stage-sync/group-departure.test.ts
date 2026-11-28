import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, openActivityJoining } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { expireStudentSession, markStudentDisconnected } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('group departure', () => {
  let db: SqliteDatabase; let server: Server; let baseUrl: string; let activityId: string;
  beforeEach(async () => {
    db = createTestDatabase();
    const teacher = createSession(db, 'teacher'); activityId = createActivity(db, teacher.sessionId).activityId;
    seedGuidedNotesQuestions(db, activityId); openActivityJoining(db, teacher.sessionId, activityId);
    server = createApp(db).listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); db.close(); });
  const enroll = (sessionId: string, body: unknown) => fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(body) });
  const leave = (sessionId: string) => fetch(`${baseUrl}/api/sessions/${sessionId}/reset-context`, { method: 'POST' });

  it('promotes the remaining member and allows another student to fill the vacant seat after leader return', async () => {
    const leader = createSession(db, 'student');
    const group = await (await enroll(leader.sessionId, { mode: 'leader', groupName: 'Leaving Leader' })).json() as { inviteCode: string; groupId: string };
    const member = createSession(db, 'student'); await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    const beforeDeparture = db.prepare(`SELECT g.live_revision AS groupRevision, a.live_revision AS activityRevision
      FROM groups g JOIN activities a ON a.id = g.activity_id WHERE g.id = ?`).get(group.groupId) as { groupRevision: number; activityRevision: number };
    const leaveResponse = await leave(leader.sessionId);
    expect(leaveResponse.status).toBe(200);
    expect(await leaveResponse.json()).toEqual({ sessionId: leader.sessionId, status: 'retired', activityId: null, groupId: null });
    expect(db.prepare(`SELECT g.live_revision AS groupRevision, a.live_revision AS activityRevision
      FROM groups g JOIN activities a ON a.id = g.activity_id WHERE g.id = ?`).get(group.groupId))
      .toEqual({ groupRevision: beforeDeparture.groupRevision + 1, activityRevision: beforeDeparture.activityRevision + 1 });
    expect(db.prepare('SELECT accepts_members, leader_session_id AS leaderSessionId FROM groups WHERE id = ?').get(group.groupId))
      .toEqual({ accepts_members: 1, leaderSessionId: member.sessionId });
    expect(db.prepare('SELECT group_role AS groupRole FROM user_sessions WHERE id = ?').get(member.sessionId)).toEqual({ groupRole: 'leader' });
    expect((await fetch(`${baseUrl}/api/sessions/${member.sessionId}`)).status).toBe(200);
    const newcomer = createSession(db, 'student');
    expect((await enroll(newcomer.sessionId, { mode: 'member', inviteCode: group.inviteCode })).status).toBe(201);
  });

  it('assigns leader to the first student who joins a leaderless empty team', async () => {
    const leader = createSession(db, 'student');
    const group = await (await enroll(leader.sessionId, { mode: 'leader', groupName: 'Empty Team' })).json() as { inviteCode: string; groupId: string };
    const member = createSession(db, 'student'); await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    await leave(leader.sessionId);
    await leave(member.sessionId);

    expect(db.prepare('SELECT leader_session_id AS leaderSessionId, accepts_members FROM groups WHERE id = ?').get(group.groupId))
      .toEqual({ leaderSessionId: null, accepts_members: 1 });
    const firstJoiner = createSession(db, 'student');
    const response = await enroll(firstJoiner.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    expect(response.status).toBe(201);
    expect(db.prepare('SELECT leader_session_id AS leaderSessionId FROM groups WHERE id = ?').get(group.groupId))
      .toEqual({ leaderSessionId: firstJoiner.sessionId });
    expect(db.prepare('SELECT group_role AS groupRole FROM user_sessions WHERE id = ?').get(firstJoiner.sessionId))
      .toEqual({ groupRole: 'leader' });
  });

  it('frees an explicitly retired member seat while a clean leader disconnect keeps its membership', async () => {
    const leader = createSession(db, 'student');
    const group = await (await enroll(leader.sessionId, { mode: 'leader', groupName: 'Leaving Member' })).json() as { inviteCode: string; groupId: string };
    const member = createSession(db, 'student'); await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    await leave(member.sessionId);
    const replacement = createSession(db, 'student');
    expect((await enroll(replacement.sessionId, { mode: 'member', inviteCode: group.inviteCode })).status).toBe(201);
    markStudentDisconnected(db, leader.sessionId, new Date(Date.now() - 120_001));
    expireStudentSession(db, leader.sessionId, new Date());
    expect(db.prepare('SELECT accepts_members, leader_session_id AS leaderSessionId FROM groups WHERE id = ?').get(group.groupId))
      .toEqual({ accepts_members: 1, leaderSessionId: replacement.sessionId });
    expect(db.prepare('SELECT group_role AS groupRole FROM user_sessions WHERE id = ?').get(leader.sessionId)).toEqual({ groupRole: 'member' });
    expect(db.prepare('SELECT group_id FROM user_sessions WHERE id = ?').get(leader.sessionId)).toEqual({ group_id: group.groupId });
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
