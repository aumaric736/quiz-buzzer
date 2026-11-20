import { afterEach, describe, expect, it } from 'vitest';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('activity lifecycle service', () => {
  const db = createTestDatabase();
  afterEach(() => { db.exec('UPDATE user_sessions SET activity_id = NULL, group_id = NULL; DELETE FROM groups; DELETE FROM activities; DELETE FROM user_sessions'); });

  it('creates in preparation, saves teacher context, then advances in order', () => {
    const teacher = createSession(db, 'teacher');
    const activity = createActivity(db, teacher.sessionId);
    expect(activity).toMatchObject({ phase: '準備中', revision: 0 });
    expect(db.prepare('SELECT activity_id FROM user_sessions WHERE id = ?').get(teacher.sessionId)).toEqual({ activity_id: activity.activityId });
    seedGuidedNotesQuestions(db, activity.activityId);
    expect(transitionActivity(db, teacher.sessionId, activity.activityId, '搶答進行中')).toMatchObject({ phase: '搶答進行中', revision: 1 });
    expect(transitionActivity(db, teacher.sessionId, activity.activityId, '已結束')).toMatchObject({ phase: '已結束', revision: 2 });
  });

  it('rejects student, skipped, reversed, unknown, and terminal-state changes without modifying state', () => {
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    const activity = createActivity(db, teacher.sessionId);
    for (const [sessionId, phase] of [[student.sessionId, '搶答進行中'], [teacher.sessionId, '已結束'], [teacher.sessionId, '準備中'], [teacher.sessionId, 'invalid']] as const) {
      expect(() => transitionActivity(db, sessionId, activity.activityId, phase)).toThrow();
    }
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activity.activityId)).toEqual({ phase: '準備中', revision: 0 });
    seedGuidedNotesQuestions(db, activity.activityId);
    transitionActivity(db, teacher.sessionId, activity.activityId, '搶答進行中');
    transitionActivity(db, teacher.sessionId, activity.activityId, '已結束');
    expect(() => transitionActivity(db, teacher.sessionId, activity.activityId, '準備中')).toThrow();
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activity.activityId)).toEqual({ phase: '已結束', revision: 2 });
  });

  it('completes twenty consecutive valid transitions across ten fresh activities', () => {
    const teacher = createSession(db, 'teacher');
    for (let index = 0; index < 10; index += 1) {
      const activity = createActivity(db, teacher.sessionId);
      seedGuidedNotesQuestions(db, activity.activityId);
      expect(transitionActivity(db, teacher.sessionId, activity.activityId, '搶答進行中').revision).toBe(1);
      expect(transitionActivity(db, teacher.sessionId, activity.activityId, '已結束').revision).toBe(2);
    }
    expect(db.prepare('SELECT count(*) AS total FROM activities').get()).toEqual({ total: 10 });
  });
});
