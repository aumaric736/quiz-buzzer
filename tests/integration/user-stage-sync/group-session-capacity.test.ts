import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, openActivityJoining, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('two active membership sessions per group', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let server: Server;
  let baseUrl: string;
  let activityId: string;
  let teacherId: string;
  beforeEach(async () => {
    db = createTestDatabase();
    const teacher = createSession(db, 'teacher');
    teacherId = teacher.sessionId;
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
  const enroll = (sessionId: string, body: unknown) => fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(body) });

  it('allows leader plus one member and rejects a third active session', async () => {
    const leader = createSession(db, 'student');
    const made = await enroll(leader.sessionId, { mode: 'leader', groupName: 'Cyan' });
    const group = await made.json() as { inviteCode: string };
    expect(group.inviteCode).toMatch(/^\d{6}$/);
    const member = createSession(db, 'student');
    expect((await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode })).status).toBe(201);
    const third = createSession(db, 'student');
    const rejected = await enroll(third.sessionId, { mode: 'member', inviteCode: group.inviteCode });
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({ code: 'GROUP_FULL' });
  });

  it('does not count a failed invitation attempt against an available seat', async () => {
    const leader = createSession(db, 'student');
    const group = await (await enroll(leader.sessionId, { mode: 'leader', groupName: 'Amber' })).json() as { inviteCode: string };
    const member = createSession(db, 'student');
    for (let attempt = 0; attempt < 30; attempt += 1) await enroll(member.sessionId, { mode: 'member', inviteCode: '999999' });
    expect((await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode })).status).toBe(201);
  });

  it('supports 100 groups with two active sessions each and one shared accepted answer per group', async () => {
    const groups: Array<{ groupId: string; inviteCode: string; leaderId: string; memberId: string }> = [];

    for (let index = 0; index < 100; index += 1) {
      const leader = createSession(db, 'student');
      const created = await enroll(leader.sessionId, { mode: 'leader', groupName: `Capacity Group ${index + 1}` });
      expect(created.status, `leader enrollment for group ${index + 1}`).toBe(201);
      const group = await created.json() as { groupId: string; inviteCode: string };
      expect(group.inviteCode).toMatch(/^\d{6}$/);

      const member = createSession(db, 'student');
      const joined = await enroll(member.sessionId, { mode: 'member', inviteCode: group.inviteCode });
      expect(joined.status, `member enrollment for group ${index + 1}`).toBe(201);
      groups.push({ ...group, leaderId: leader.sessionId, memberId: member.sessionId });
    }

    const rosterResponse = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, {
      headers: { 'X-Local-Session-Id': teacherId }
    });
    expect(rosterResponse.status).toBe(200);
    const roster = await rosterResponse.json() as { items: Array<{ groupId: string; onlineCount: number; joinStatus: string }> };
    expect(roster.items).toHaveLength(100);
    expect(roster.items.every((item) => item.onlineCount === 2 && item.joinStatus === '額滿')).toBe(true);
    expect(new Set(roster.items.map((item) => item.groupId))).toEqual(new Set(groups.map((group) => group.groupId)));

    transitionActivity(db, teacherId, activityId, '搶答進行中');
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index]!;
      const answerParts = [`answer-${index + 1}`];
      const submitted = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Local-Session-Id': group.leaderId },
        body: JSON.stringify({ questionNumber: 1, answerParts })
      });
      expect(submitted.status, `answer submission for group ${index + 1}`).toBe(201);

      const sharedStatus = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, {
        headers: { 'X-Local-Session-Id': group.memberId }
      });
      expect(sharedStatus.status).toBe(200);
      expect(await sharedStatus.json()).toEqual({
        phase: '搶答進行中', items: [{ questionNumber: 1, displayOrder: 0, status: 'submitted', answerParts }]
      });
    }

    const duplicate = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': groups[0]!.memberId },
      body: JSON.stringify({ questionNumber: 1, answerParts: ['different-answer'] })
    });
    expect(duplicate.status).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS count FROM buzzer_submissions WHERE activity_id = ? AND question_number = 1').get(activityId))
      .toEqual({ count: 100 });
  });
});
