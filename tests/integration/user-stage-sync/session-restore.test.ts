import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';
import { restoreApplicationSession } from '../../../client/src/features/user-stage-sync/services/session-restore.js';
import { markStudentDisconnected, reconcileExpiredStudentSessions, restoreStudentPresence } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';

describe('session and activity restoration', () => {
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
    enrollGroup(db, studentId, activityId, 'Blue Team');
    seedGuidedNotesQuestions(db, activityId);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('restores a student role, group context and authoritative phase within three seconds', async () => {
    const startedAt = performance.now();
    const restored = await restoreApplicationSession(studentId, baseUrl);
    expect(performance.now() - startedAt).toBeLessThan(3000);
    expect(restored.session).toMatchObject({ role: 'student', activityId, groupId: expect.any(String), groupName: 'Blue Team' });
    expect(restored.activity).toMatchObject({ activityId, phase: '搶答進行中', revision: 1 });
  });

  it('returns a clear recovery error for a session that no longer exists', async () => {
    const response = await fetch(`${baseUrl}/api/sessions/missing-session`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'SESSION_NOT_FOUND', message: expect.any(String) });
  });

  it('retains and restores the same team seat before two minutes, then frees it after expiry', () => {
    const prepActivityId = createActivity(db, teacherId).activityId;
    const leaderId = createSession(db, 'student').sessionId;
    const team = enrollGroup(db, leaderId, prepActivityId, { mode: 'leader', groupName: 'Retention Team' });
    const memberId = createSession(db, 'student').sessionId;
    enrollGroup(db, memberId, prepActivityId, { mode: 'member', inviteCode: team.inviteCode });
    const disconnectedAt = new Date('2026-11-26T01:00:00.000Z');
    markStudentDisconnected(db, memberId, disconnectedAt);
    expect(restoreStudentPresence(db, memberId, new Date(disconnectedAt.getTime() + 119_999))).toBe(true);
    markStudentDisconnected(db, memberId, disconnectedAt);
    expect(reconcileExpiredStudentSessions(db, new Date(disconnectedAt.getTime() + 120_000))).toBe(1);
    const replacement = createSession(db, 'student');
    expect(enrollGroup(db, replacement.sessionId, prepActivityId, { mode: 'member', inviteCode: team.inviteCode })).toMatchObject({ groupId: team.groupId });
    expect(db.prepare('SELECT group_id AS groupId FROM user_sessions WHERE id = ?').get(memberId)).toEqual({ groupId: null });
  });
});
