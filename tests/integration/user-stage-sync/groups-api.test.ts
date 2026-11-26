import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createGroupWithInviteCode, formatInviteCode } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('group enrollment API', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let studentId: string;
  let activityId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    teacherId = teacher.sessionId;
    studentId = student.sessionId;
    activityId = createActivity(db, teacherId).activityId;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function join(sessionId: string, groupName: unknown) {
    return fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify({ groupName }) });
  }

  it('enrolls a student group and persists its activity/group context', async () => {
    const response = await join(studentId, '  Red Team  ');
    expect(response.status).toBe(201);
    const result = await response.json() as { groupId: string; activityId: string; displayName: string };
    expect(result).toMatchObject({ activityId, displayName: 'Red Team' });
    expect(db.prepare('SELECT activity_id, group_id FROM user_sessions WHERE id = ?').get(studentId)).toEqual({ activity_id: activityId, group_id: result.groupId });
  });

  it('rejects duplicates, blank names, teacher joins, and late joins without mutating context', async () => {
    expect((await join(studentId, 'Red Team')).status).toBe(201);
    const before = db.prepare('SELECT activity_id, group_id FROM user_sessions WHERE id = ?').get(studentId);
    expect((await join(studentId, ' red TEAM ')).status).toBe(409);
    const duplicateStudent = createSession(db, 'student');
    expect((await join(duplicateStudent.sessionId, ' RED team ')).status).toBe(409);
    expect(db.prepare('SELECT activity_id, group_id FROM user_sessions WHERE id = ?').get(duplicateStudent.sessionId)).toEqual({ activity_id: null, group_id: null });
    expect((await join(studentId, ' ')).status).toBe(400);
    expect((await join(teacherId, 'Teacher Team')).status).toBe(403);
    seedGuidedNotesQuestions(db, activityId);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const late = await join(studentId, 'Late Team');
    expect(late.status).toBe(409);
    expect(await late.json()).toMatchObject({ code: 'ENROLLMENT_CLOSED' });
    expect(db.prepare('SELECT activity_id, group_id FROM user_sessions WHERE id = ?').get(studentId)).toEqual(before);
    expect(db.prepare('SELECT count(*) AS total FROM groups').get()).toEqual({ total: 1 });
  });

  it('serializes concurrent duplicate requests so exactly one group is enrolled', async () => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => join(studentId, 'Concurrent Group')));
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409, 409, 409]);
    expect(db.prepare('SELECT count(*) AS total FROM groups').get()).toEqual({ total: 1 });
  });

  it('enrolls ten distinct groups in one preparation activity', async () => {
    const responses = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
      const student = createSession(db, 'student');
      const response = await join(student.sessionId, `Team ${index + 1}`);
      return response.status;
    }));
    expect(responses.every((status) => status === 201)).toBe(true);
    expect(db.prepare('SELECT count(*) AS total FROM groups WHERE activity_id = ?').get(activityId)).toEqual({ total: 10 });
  });

  it('returns a random six-digit invite code and caps the activity at 100 groups', async () => {
    const first = await join(studentId, 'Random Team');
    expect(first.status).toBe(201);
    const firstGroup = await first.json() as { inviteCode: string };
    expect(firstGroup.inviteCode).toMatch(/^\d{6}$/);
    for (let index = 1; index < 100; index += 1) {
      const student = createSession(db, 'student');
      const response = await joinAs(student.sessionId, `Team ${index}`);
      expect(response.status).toBe(201);
    }
    const last = createSession(db, 'student');
    const response = await joinAs(last.sessionId, 'Team 101');
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'GROUP_LIMIT_REACHED' });
    expect(db.prepare('SELECT count(*) AS total FROM groups WHERE activity_id = ?').get(activityId)).toEqual({ total: 100 });
  });

  it('preserves leading zeroes and retries an activity-scoped invite-code collision', () => {
    const leaderA = createSession(db, 'student');
    const first = createGroupWithInviteCode(db, activityId, 'Zero Team', leaderA.sessionId, () => 4207);
    const values = [4207, 73];
    const leaderB = createSession(db, 'student');
    const second = createGroupWithInviteCode(db, activityId, 'Retry Team', leaderB.sessionId, () => values.shift()!);
    expect(formatInviteCode(73)).toBe('000073');
    expect(first.inviteCode).toBe('004207');
    expect(second.inviteCode).toBe('000073');
    expect(values).toHaveLength(0);
  });

  async function joinAs(sessionId: string, groupName: string) {
    return fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify({ mode: 'leader', groupName }) });
  }
});
