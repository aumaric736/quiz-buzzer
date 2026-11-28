import { describe, expect, it } from 'vitest';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession, getSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { markStudentDisconnected, reconcileExpiredStudentSessions, restoreStudentPresence } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { listGroupRoster } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import { configureStudentPresencePublisher } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
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
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 0 });
      expect(reconcileExpiredStudentSessions(db, new Date('2036-01-01T00:00:00.000Z'))).toBe(0);
      expect(restoreStudentPresence(db, leaderId, new Date('2036-01-01T00:00:00.000Z'))).toBe(true);
      expect(getSession(db, leaderId)).toMatchObject({ activityId, groupId: group.groupId, groupRole: 'leader' });
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
