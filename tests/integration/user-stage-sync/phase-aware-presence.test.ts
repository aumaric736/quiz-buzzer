import { afterEach, describe, expect, it, vi } from 'vitest';
import { createActivity, openActivityJoining, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { markStudentDisconnected, restoreStudentPresence } from '../../../server/src/features/user-stage-sync/application/student-session-presence-service.js';
import { createSession, getSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { listGroupRoster } from '../../../server/src/features/user-stage-sync/persistence/group-repository.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('phase-aware student presence', () => {
  afterEach(() => vi.useRealTimers());
  function readyActivity(db: ReturnType<typeof createTestDatabase>) {
    const teacherId = createSession(db, 'teacher').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [1]);
    openActivityJoining(db, teacherId, activityId);
    return { teacherId, activityId };
  }

  it('releases a team-formation vacancy as soon as disconnection is classified while retaining membership', () => {
    const db = createTestDatabase();
    try {
      const { activityId } = readyActivity(db);
      const leader = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leader, activityId, { mode: 'leader', groupName: 'Blue' });
      const member = createSession(db, 'student').sessionId;
      enrollGroup(db, member, activityId, { mode: 'member', inviteCode: group.inviteCode });

      markStudentDisconnected(db, member, new Date());
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, joinStatus: '開放加入' });
      expect(db.prepare('SELECT group_id AS groupId, retired_at AS retiredAt FROM user_sessions WHERE id = ?').get(member))
        .toEqual({ groupId: group.groupId, retiredAt: null });
      expect(restoreStudentPresence(db, member, new Date(Date.now() + 86_400_000))).toBe(true);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 2, joinStatus: '額滿' });
    } finally { db.close(); }
  });

  it('waits for 30 consecutive seconds without heartbeat after an unclean interruption', async () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    const db = createTestDatabase();
    try {
      const { activityId } = readyActivity(db);
      const leader = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leader, activityId, { mode: 'leader', groupName: 'Heartbeat Team' });
      const member = createSession(db, 'student').sessionId;
      enrollGroup(db, member, activityId, { mode: 'member', inviteCode: group.inviteCode });
      markStudentDisconnected(db, member, new Date(), 30_000);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 2, joinStatus: '額滿' });
      await vi.advanceTimersByTimeAsync(29_999);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 2 });
      await vi.advanceTimersByTimeAsync(1);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, joinStatus: '開放加入' });
    } finally { db.close(); }
  });

  it('keeps a returning student offline when the original group filled the vacancy and allows reassignment', () => {
    const db = createTestDatabase();
    try {
      const { activityId } = readyActivity(db);
      const leader = createSession(db, 'student').sessionId;
      const original = enrollGroup(db, leader, activityId, { mode: 'leader', groupName: 'Original' });
      const returning = createSession(db, 'student').sessionId;
      enrollGroup(db, returning, activityId, { mode: 'member', inviteCode: original.inviteCode });
      markStudentDisconnected(db, returning);
      const newcomer = createSession(db, 'student').sessionId;
      enrollGroup(db, newcomer, activityId, { mode: 'member', inviteCode: original.inviteCode });

      expect(restoreStudentPresence(db, returning)).toBe(true);
      expect(getSession(db, returning).recoveryRequired).toBe(true);
      expect(db.prepare('SELECT disconnected_at AS disconnectedAt, group_id AS groupId FROM user_sessions WHERE id = ?').get(returning))
        .toMatchObject({ disconnectedAt: expect.any(String), groupId: original.groupId });
      expect(() => enrollGroup(db, returning, activityId, { mode: 'member', inviteCode: original.inviteCode })).toThrow(/原小組已額滿/);

      const otherLeader = createSession(db, 'student').sessionId;
      const other = enrollGroup(db, otherLeader, activityId, { mode: 'leader', groupName: 'Other' });
      expect(enrollGroup(db, returning, activityId, { mode: 'member', inviteCode: other.inviteCode }))
        .toMatchObject({ groupId: other.groupId, groupRole: 'member' });
      expect(db.prepare('SELECT group_id AS groupId, disconnected_at AS disconnectedAt FROM user_sessions WHERE id = ?').get(returning))
        .toEqual({ groupId: other.groupId, disconnectedAt: null });
    } finally { db.close(); }
  });

  it('counts an offline leader as offline and restores the leader role when the original group has room', () => {
    const db = createTestDatabase();
    try {
      const { activityId } = readyActivity(db);
      const leader = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leader, activityId, { mode: 'leader', groupName: 'Leader Team' });
      markStudentDisconnected(db, leader);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 0, joinStatus: '開放加入' });
      expect(restoreStudentPresence(db, leader, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))).toBe(true);
      expect(db.prepare('SELECT group_role AS role, disconnected_at AS disconnectedAt FROM user_sessions WHERE id = ?').get(leader))
        .toEqual({ role: 'leader', disconnectedAt: null });
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, joinStatus: '開放加入' });
      expect(group.groupId).toBeTruthy();
    } finally { db.close(); }
  });

  it('allows unlimited reconnection during answering and immediately classifies a clean close', () => {
    const db = createTestDatabase();
    try {
      const { teacherId, activityId } = readyActivity(db);
      const leader = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leader, activityId, { mode: 'leader', groupName: 'Answering' });
      const member = createSession(db, 'student').sessionId;
      enrollGroup(db, member, activityId, { mode: 'member', inviteCode: group.inviteCode });
      transitionActivity(db, teacherId, activityId, '搶答進行中');

      markStudentDisconnected(db, member);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 1, joinStatus: '停止加入' });
      expect(restoreStudentPresence(db, member, new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000))).toBe(true);
      expect(listGroupRoster(db, activityId)[0]).toMatchObject({ onlineCount: 2, joinStatus: '停止加入' });
      expect(db.prepare('SELECT group_id AS groupId FROM user_sessions WHERE id = ?').get(member)).toEqual({ groupId: group.groupId });

      transitionActivity(db, teacherId, activityId, '已結束');
      markStudentDisconnected(db, member);
      expect(restoreStudentPresence(db, member)).toBe(false);
      expect(db.prepare('SELECT group_id AS groupId, disconnected_at AS disconnectedAt FROM user_sessions WHERE id = ?').get(member))
        .toMatchObject({ groupId: group.groupId, disconnectedAt: expect.any(String) });
      const lateStudent = createSession(db, 'student').sessionId;
      expect(() => enrollGroup(db, lateStudent, activityId, { mode: 'leader', groupName: 'Late Team' })).toThrow(/活動已開始或結束/);
    } finally { db.close(); }
  });
});
