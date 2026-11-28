import { afterEach, describe, expect, it } from 'vitest';
import { createActivity, openActivityJoining, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('group enrollment service', () => {
  const db = createTestDatabase();
  afterEach(() => { db.exec('UPDATE user_sessions SET activity_id = NULL, group_id = NULL; DELETE FROM groups; DELETE FROM activities; DELETE FROM user_sessions'); });

  it('trims group names, saves a group, and updates the student context', () => {
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    const activity = createActivity(db, teacher.sessionId);
    seedGuidedNotesQuestions(db, activity.activityId);
    openActivityJoining(db, teacher.sessionId, activity.activityId);
    const group = enrollGroup(db, student.sessionId, activity.activityId, '  Blue Team  ');
    expect(group).toMatchObject({ activityId: activity.activityId, displayName: 'Blue Team' });
    expect(db.prepare('SELECT activity_id, group_id FROM user_sessions WHERE id = ?').get(student.sessionId)).toEqual({ activity_id: activity.activityId, group_id: group.groupId });
  });

  it('rejects blank/duplicate names, wrong roles, and joining after preparation without changing session context', () => {
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    const activity = createActivity(db, teacher.sessionId);
    seedGuidedNotesQuestions(db, activity.activityId);
    openActivityJoining(db, teacher.sessionId, activity.activityId);
    enrollGroup(db, student.sessionId, activity.activityId, 'Blue Team');
    for (const [sessionId, name] of [[student.sessionId, '   '], [student.sessionId, ' blue TEAM '], [teacher.sessionId, 'Red Team']] as const) {
      expect(() => enrollGroup(db, sessionId, activity.activityId, name)).toThrow();
    }
    const before = db.prepare('SELECT activity_id, group_id FROM user_sessions WHERE id = ?').get(student.sessionId);
    transitionActivity(db, teacher.sessionId, activity.activityId, '搶答進行中');
    expect(() => enrollGroup(db, student.sessionId, activity.activityId, 'Red Team')).toThrow();
    expect(db.prepare('SELECT activity_id, group_id FROM user_sessions WHERE id = ?').get(student.sessionId)).toEqual(before);
    expect(db.prepare('SELECT count(*) AS total FROM groups').get()).toEqual({ total: 1 });
  });

  it('requires a ready question set and explicit teacher opening before any student can enroll', () => {
    const teacher = createSession(db, 'teacher');
    const leader = createSession(db, 'student');
    const member = createSession(db, 'student');
    const activity = createActivity(db, teacher.sessionId);

    expect(() => enrollGroup(db, leader.sessionId, activity.activityId, 'Blue Team')).toThrow(/尚未開放加入/);
    expect(() => openActivityJoining(db, teacher.sessionId, activity.activityId)).toThrow(/先匯入至少一題/);
    seedGuidedNotesQuestions(db, activity.activityId);
    expect(() => enrollGroup(db, leader.sessionId, activity.activityId, 'Blue Team')).toThrow(/尚未開放加入/);
    openActivityJoining(db, teacher.sessionId, activity.activityId);
    const group = enrollGroup(db, leader.sessionId, activity.activityId, 'Blue Team');
    expect(enrollGroup(db, member.sessionId, activity.activityId, { mode: 'member', inviteCode: group.inviteCode })).toMatchObject({ groupId: group.groupId });
  });
});
