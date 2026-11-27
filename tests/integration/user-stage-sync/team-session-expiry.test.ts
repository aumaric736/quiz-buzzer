import { describe, expect, it } from 'vitest';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { configureStudentPresencePublisher, markStudentDisconnected, reconcileExpiredStudentSessions, restoreStudentPresence } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { listGroupRoster } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import { createTestDatabase } from '../../helpers/sqlite.js';

describe('team session expiry', () => {
  it('retires an expired leader, closes the group at the deadline, publishes both snapshots, and rejects a same-deadline join', () => {
    const db = createTestDatabase();
    const notifications: string[] = [];
    const clear = configureStudentPresencePublisher((activityId, groupId) => notifications.push(`team:${activityId}:${groupId}`), (activityId) => notifications.push(`teacher:${activityId}`));
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      const leaderId = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leaderId, activityId, { mode: 'leader', groupName: 'Closing Team' });
      const memberId = createSession(db, 'student').sessionId;
      enrollGroup(db, memberId, activityId, { mode: 'member', inviteCode: group.inviteCode });
      const joinedAt = new Date(Date.now() + 60_000);
      markStudentDisconnected(db, leaderId, joinedAt);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, occupiedCount: 2, acceptsMembers: true });
      expect(restoreStudentPresence(db, leaderId, new Date(joinedAt.getTime() + 119_999))).toBe(true);
      const secondDisconnect = new Date(Date.now() + 60_000);
      markStudentDisconnected(db, leaderId, secondDisconnect);
      expect(reconcileExpiredStudentSessions(db, new Date(secondDisconnect.getTime() + 120_000))).toBe(1);
      expect(restoreStudentPresence(db, leaderId, new Date(secondDisconnect.getTime() + 120_000))).toBe(false);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, occupiedCount: 1, acceptsMembers: false });

      const newcomer = createSession(db, 'student').sessionId;
      expect(() => enrollGroup(db, newcomer, activityId, { mode: 'member', inviteCode: group.inviteCode })).toThrow(/找不到可加入/);
      expect(db.prepare('SELECT activity_id AS activityId, group_id AS groupId, retired_at AS retiredAt FROM user_sessions WHERE id = ?').get(leaderId))
        .toMatchObject({ activityId: null, groupId: null, retiredAt: expect.any(String) });
      expect(notifications.filter((item) => item.startsWith('team:'))).toHaveLength(4);
      expect(notifications.filter((item) => item.startsWith('teacher:'))).toHaveLength(4);
    } finally { clear(); db.close(); }
  });

  it('commits a leader expiry before rejecting a join submitted at its deadline', () => {
    const db = createTestDatabase();
    const notifications: string[] = [];
    const clear = configureStudentPresencePublisher((activityId, groupId) => notifications.push(`team:${activityId}:${groupId}`), (activityId) => notifications.push(`teacher:${activityId}`));
    try {
      const teacherId = createSession(db, 'teacher').sessionId;
      const activityId = createActivity(db, teacherId).activityId;
      const leaderId = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leaderId, activityId, { mode: 'leader', groupName: 'Deadline Team' });
      const deadline = new Date(Date.now()).toISOString();
      db.prepare('UPDATE user_sessions SET disconnected_until = ? WHERE id = ?').run(deadline, leaderId);
      const newcomerId = createSession(db, 'student').sessionId;

      expect(() => enrollGroup(db, newcomerId, activityId, { mode: 'member', inviteCode: group.inviteCode })).toThrow(/找不到可加入/);
      expect(db.prepare('SELECT accepts_members AS acceptsMembers FROM groups WHERE id = ?').get(group.groupId)).toEqual({ acceptsMembers: 0 });
      expect(db.prepare('SELECT group_id AS groupId, retired_at AS retiredAt FROM user_sessions WHERE id = ?').get(leaderId))
        .toMatchObject({ groupId: null, retiredAt: expect.any(String) });
      expect(notifications).toContain(`team:${activityId}:${group.groupId}`);
      expect(notifications).toContain(`teacher:${activityId}`);
    } finally { clear(); db.close(); }
  });

  it('publishes team and teacher snapshots for every activity when a successful join triggers expiry reconciliation', () => {
    const db = createTestDatabase();
    const notifications: string[] = [];
    const clear = configureStudentPresencePublisher((activityId, groupId) => notifications.push(`team:${activityId}:${groupId}`), (activityId) => notifications.push(`teacher:${activityId}`));
    try {
      const teacherA = createSession(db, 'teacher').sessionId;
      const activityA = createActivity(db, teacherA).activityId;
      const expiringLeader = createSession(db, 'student').sessionId;
      const closedGroup = enrollGroup(db, expiringLeader, activityA, { mode: 'leader', groupName: 'Expired Leader Team' });
      const activeMateA = createSession(db, 'student').sessionId;
      enrollGroup(db, activeMateA, activityA, { mode: 'member', inviteCode: closedGroup.inviteCode });

      const teacherB = createSession(db, 'teacher').sessionId;
      const activityB = createActivity(db, teacherB).activityId;
      const activeLeaderB = createSession(db, 'student').sessionId;
      const openGroup = enrollGroup(db, activeLeaderB, activityB, { mode: 'leader', groupName: 'Expired Member Team' });
      const expiringMember = createSession(db, 'student').sessionId;
      enrollGroup(db, expiringMember, activityB, { mode: 'member', inviteCode: openGroup.inviteCode });

      const triggerLeader = createSession(db, 'student').sessionId;
      const triggerGroup = enrollGroup(db, triggerLeader, activityA, { mode: 'leader', groupName: 'Trigger Team' });
      notifications.length = 0;
      const deadline = new Date(Date.now() - 1).toISOString();
      db.prepare('UPDATE user_sessions SET disconnected_until = ? WHERE id = ?').run(deadline, expiringLeader);
      db.prepare('UPDATE user_sessions SET disconnected_until = ? WHERE id = ?').run(deadline, expiringMember);
      const joiningMember = createSession(db, 'student').sessionId;

      enrollGroup(db, joiningMember, activityA, { mode: 'member', inviteCode: triggerGroup.inviteCode });

      expect(db.prepare('SELECT accepts_members AS acceptsMembers FROM groups WHERE id = ?').get(closedGroup.groupId)).toEqual({ acceptsMembers: 0 });
      expect(db.prepare('SELECT group_id AS groupId FROM user_sessions WHERE id = ?').get(expiringLeader)).toEqual({ groupId: null });
      expect(db.prepare('SELECT group_id AS groupId FROM user_sessions WHERE id = ?').get(expiringMember)).toEqual({ groupId: null });
      expect(notifications).toContain(`team:${activityA}:${closedGroup.groupId}`);
      expect(notifications).toContain(`teacher:${activityA}`);
      expect(notifications).toContain(`team:${activityB}:${openGroup.groupId}`);
      expect(notifications).toContain(`teacher:${activityB}`);
    } finally { clear(); db.close(); }
  });
});
