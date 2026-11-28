import { describe, expect, it } from 'vitest';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession, getSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { configureStudentPresencePublisher, markStudentDisconnected, reconcileExpiredStudentSessions, restoreStudentPresence } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { listGroupRoster } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import { createTestDatabase, enrollGroupForTest } from '../../helpers/sqlite.js';

describe('student reconnect retention', () => {
  it('keeps a cleanly disconnected session and its original group recoverable without a deadline', () => {
    const db = createTestDatabase();
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      const leaderId = createSession(db, 'student').sessionId;
      const group = enrollGroupForTest(db, leaderId, activityId, { mode: 'leader', groupName: 'Persistent Team' });

      markStudentDisconnected(db, leaderId, new Date('2026-01-01T00:00:00.000Z'));
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 0, leaderOnline: false });
      expect(reconcileExpiredStudentSessions(db, new Date('2036-01-01T00:00:00.000Z'))).toBe(0);
      expect(restoreStudentPresence(db, leaderId, new Date('2036-01-01T00:00:00.000Z'))).toBe(true);
      expect(getSession(db, leaderId)).toMatchObject({ activityId, groupId: group.groupId, groupRole: 'member' });
      expect(db.prepare('SELECT leader_session_id AS leaderSessionId FROM groups WHERE id = ?').get(group.groupId))
        .toEqual({ leaderSessionId: null });
      expect(db.prepare('SELECT retired_at AS retiredAt, disconnected_at AS disconnectedAt FROM user_sessions WHERE id = ?').get(leaderId))
        .toEqual({ retiredAt: null, disconnectedAt: null });
    } finally { db.close(); }
  });

  it('migrates a legacy disconnected_until row to offline presence without retiring or detaching it', () => {
    const db = createTestDatabase();
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      const studentId = createSession(db, 'student').sessionId;
      const group = enrollGroupForTest(db, studentId, activityId, { mode: 'leader', groupName: 'Legacy Team' });
      db.prepare('UPDATE user_sessions SET disconnected_until = ?, updated_at = ? WHERE id = ?')
        .run('2026-01-01T00:02:00.000Z', '2026-01-01T00:00:00.000Z', studentId);

      expect(reconcileExpiredStudentSessions(db, new Date('2026-01-01T00:03:00.000Z'))).toBe(1);
      expect(db.prepare(`SELECT disconnected_at AS disconnectedAt, disconnected_until AS oldDeadline,
        activity_id AS activityId, group_id AS groupId, retired_at AS retiredAt FROM user_sessions WHERE id = ?`).get(studentId))
        .toEqual({ disconnectedAt: '2026-01-01T00:00:00.000Z', oldDeadline: null, activityId, groupId: group.groupId, retiredAt: null });
      expect(restoreStudentPresence(db, studentId, new Date('2036-01-01T00:00:00.000Z'))).toBe(true);
    } finally { db.close(); }
  });

  it('hands leadership to the online member when startup reconciliation expires a legacy leader', () => {
    const db = createTestDatabase();
    const notifications: string[] = [];
    const transactionStates: boolean[] = [];
    const clear = configureStudentPresencePublisher((activityId, groupId) => {
      notifications.push(`team:${activityId}:${groupId}`);
      transactionStates.push(db.inTransaction);
    }, (activityId) => {
      notifications.push(`teacher:${activityId}`);
      transactionStates.push(db.inTransaction);
    });
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      const leaderId = createSession(db, 'student').sessionId;
      const group = enrollGroupForTest(db, leaderId, activityId, { mode: 'leader', groupName: 'Legacy Leader Team' });
      const memberId = createSession(db, 'student').sessionId;
      enrollGroupForTest(db, memberId, activityId, { mode: 'member', inviteCode: group.inviteCode });
      const before = db.prepare(`SELECT g.live_revision AS groupRevision, a.live_revision AS activityRevision
        FROM groups g JOIN activities a ON a.id = g.activity_id WHERE g.id = ?`).get(group.groupId) as
        { groupRevision: number; activityRevision: number };
      db.prepare('UPDATE user_sessions SET disconnected_until = ?, updated_at = ? WHERE id = ?')
        .run('2026-01-01T00:00:30.000Z', '2026-01-01T00:00:00.000Z', leaderId);
      notifications.length = 0;
      transactionStates.length = 0;

      expect(reconcileExpiredStudentSessions(db, new Date('2026-01-01T00:00:30.000Z'))).toBe(1);

      expect(db.prepare('SELECT leader_session_id AS leaderSessionId FROM groups WHERE id = ?').get(group.groupId))
        .toEqual({ leaderSessionId: memberId });
      expect(db.prepare('SELECT group_role AS groupRole, disconnected_at AS disconnectedAt FROM user_sessions WHERE id = ?').get(leaderId))
        .toMatchObject({ groupRole: 'member', disconnectedAt: '2026-01-01T00:00:00.000Z' });
      expect(db.prepare('SELECT group_role AS groupRole FROM user_sessions WHERE id = ?').get(memberId)).toEqual({ groupRole: 'leader' });
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, leaderOnline: true });
      expect(db.prepare(`SELECT g.live_revision AS groupRevision, a.live_revision AS activityRevision
        FROM groups g JOIN activities a ON a.id = g.activity_id WHERE g.id = ?`).get(group.groupId))
        .toEqual({ groupRevision: before.groupRevision + 1, activityRevision: before.activityRevision + 1 });
      expect(notifications).toEqual([`team:${activityId}:${group.groupId}`, `teacher:${activityId}`]);
      expect(transactionStates).toEqual([false, false]);
    } finally { clear(); db.close(); }
  });

  it('publishes leader online-count changes to the team and teacher after commit', () => {
    const db = createTestDatabase();
    const notifications: string[] = [];
    const clear = configureStudentPresencePublisher((activityId, groupId) => notifications.push(`team:${activityId}:${groupId}`),
      (activityId) => notifications.push(`teacher:${activityId}`));
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      const leaderId = createSession(db, 'student').sessionId;
      const group = enrollGroupForTest(db, leaderId, activityId, { mode: 'leader', groupName: 'Count Team' });
      notifications.length = 0;

      markStudentDisconnected(db, leaderId);

      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 0 });
      expect(notifications).toEqual([`team:${activityId}:${group.groupId}`, `teacher:${activityId}`]);
    } finally { clear(); db.close(); }
  });
});
