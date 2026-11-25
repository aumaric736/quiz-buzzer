import { afterEach, describe, expect, it } from 'vitest';
import { readAnswerStatus } from '../../../server/src/features/user-stage-sync/application/answer-status-access.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { submitAnswer } from '../../../server/src/features/buzzer-flow/application/buzzer-flow-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('role-filtered answer status', () => {
  let db: SqliteDatabase | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  function captureError(operation: () => unknown): unknown {
    try { operation(); } catch (error) { return error; }
    throw new Error('Expected status access to be rejected.');
  }

  it('returns teacher live details, each student own-only status, and complete no-winner results after end', () => {
    db = createTestDatabase();
    const teacherId = createSession(db, 'teacher').sessionId;
    const studentAId = createSession(db, 'student').sessionId;
    const studentBId = createSession(db, 'student').sessionId;
    const outsiderId = createSession(db, 'student').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [2, 5], 2);
    const groupA = enrollGroup(db, studentAId, activityId, 'Blue Team');
    enrollGroup(db, studentBId, activityId, 'Green Team');

    expect(readAnswerStatus(db, teacherId, activityId)).toEqual({ phase: '準備中', items: [] });
    expect(readAnswerStatus(db, studentAId, activityId)).toEqual({ phase: '準備中', items: [] });
    expect(captureError(() => readAnswerStatus(db!, outsiderId, activityId)))
      .toMatchObject({ code: 'ACTIVITY_MEMBERSHIP_REQUIRED' });

    transitionActivity(db, teacherId, activityId, '搶答進行中');
    submitAnswer(db, studentAId, activityId, { questionNumber: 2, answerParts: ['first', 'second'] });
    expect(readAnswerStatus(db, teacherId, activityId)).toEqual({
      phase: '搶答進行中',
      items: [
        { questionNumber: 2, status: 'won', groupId: groupA.groupId, groupName: 'Blue Team', answerParts: ['first', 'second'], submissions: [{ groupId: groupA.groupId, groupName: 'Blue Team', answerParts: ['first', 'second'], submissionRank: 1, isWinner: true }] },
        { questionNumber: 5, status: 'open', submissions: [] }
      ]
    });
    expect(readAnswerStatus(db, studentAId, activityId)).toEqual({
      phase: '搶答進行中', items: [{ questionNumber: 2, status: 'submitted', answerParts: ['first', 'second'] }]
    });
    expect(readAnswerStatus(db, studentBId, activityId)).toEqual({ phase: '搶答進行中', items: [] });
    submitAnswer(db, studentBId, activityId, { questionNumber: 2, answerParts: ['later', 'answer'] });
    expect(readAnswerStatus(db, studentBId, activityId)).toEqual({
      phase: '搶答進行中', items: [{ questionNumber: 2, status: 'submitted', answerParts: ['later', 'answer'] }]
    });
    expect(readAnswerStatus(db, teacherId, activityId)).toMatchObject({
      phase: '搶答進行中', items: [
        { questionNumber: 2, status: 'won', groupId: groupA.groupId, groupName: 'Blue Team', answerParts: ['first', 'second'] },
        { questionNumber: 5, status: 'open' }
      ]
    });
    db.prepare('UPDATE buzzer_submissions SET answer_parts_json = ? WHERE activity_id = ? AND question_number = ?')
      .run('["first",null]', activityId, 2);
    expect(captureError(() => readAnswerStatus(db!, teacherId, activityId))).toMatchObject({ code: 'ANSWER_STATUS_INVALID' });
    db.prepare('UPDATE buzzer_submissions SET answer_parts_json = ? WHERE activity_id = ? AND question_number = ?')
      .run('["first","second"]', activityId, 2);

    transitionActivity(db, teacherId, activityId, '已結束');
    const final = {
      phase: '已結束',
      items: [
        { questionNumber: 2, winner: true, winningGroupId: groupA.groupId, winningGroupName: 'Blue Team', answerParts: ['first', 'second'] },
        { questionNumber: 5, winner: false }
      ]
    };
    expect(readAnswerStatus(db, teacherId, activityId)).toEqual(final);
    expect(readAnswerStatus(db, studentBId, activityId)).toEqual(final);
  });
});
