import { afterEach, describe, expect, it } from 'vitest';
import { submitAnswer } from '../../../server/src/features/buzzer-flow/application/buzzer-flow-service.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('buzzer answer submission service', () => {
  let db: SqliteDatabase | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  function setup(blankCount = 2) {
    db = createTestDatabase();
    const teacherId = createSession(db, 'teacher').sessionId;
    const studentAId = createSession(db, 'student').sessionId;
    const studentBId = createSession(db, 'student').sessionId;
    const outsiderId = createSession(db, 'student').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [1, 2], blankCount);
    const groupA = enrollGroup(db, studentAId, activityId, 'Blue Team');
    const groupB = enrollGroup(db, studentBId, activityId, 'Green Team');
    return { teacherId, studentAId, studentBId, outsiderId, activityId, groupA, groupB };
  }

  function errorFrom(operation: () => unknown): unknown {
    try { operation(); } catch (error) { return error; }
    throw new Error('Expected answer submission to be rejected.');
  }

  it('accepts the first valid ordered answer and preserves each original part', () => {
    const fixture = setup();
    transitionActivity(db!, fixture.teacherId, fixture.activityId, '搶答進行中');

    const result = submitAnswer(db!, fixture.studentAId, fixture.activityId, {
      questionNumber: 1, answerParts: ['  first blank  ', 'second blank']
    });

    expect(result).toMatchObject({
      activityId: fixture.activityId,
      questionNumber: 1,
      groupId: fixture.groupA.groupId,
      groupName: 'Blue Team',
      answerParts: ['  first blank  ', 'second blank']
    });
    expect(db!.prepare('SELECT COUNT(*) AS count FROM buzzer_submissions').get()).toEqual({ count: 1 });
  });

  it('requires a student membership, live phase, and imported activity question', () => {
    const fixture = setup();
    expect(errorFrom(() => submitAnswer(db!, fixture.studentAId, fixture.activityId, { questionNumber: 1, answerParts: ['a', 'b'] })))
      .toMatchObject({ status: 409, code: 'BUZZER_NOT_OPEN' });
    transitionActivity(db!, fixture.teacherId, fixture.activityId, '搶答進行中');

    expect(errorFrom(() => submitAnswer(db!, fixture.teacherId, fixture.activityId, { questionNumber: 1, answerParts: ['a', 'b'] })))
      .toMatchObject({ status: 403, code: 'STUDENT_REQUIRED' });
    expect(errorFrom(() => submitAnswer(db!, fixture.outsiderId, fixture.activityId, { questionNumber: 1, answerParts: ['a', 'b'] })))
      .toMatchObject({ status: 403, code: 'ACTIVITY_MEMBERSHIP_REQUIRED' });
    expect(errorFrom(() => submitAnswer(db!, fixture.studentAId, fixture.activityId, { questionNumber: 99, answerParts: ['a', 'b'] })))
      .toMatchObject({ status: 404, code: 'QUESTION_NOT_FOUND' });
  });

  it('rejects malformed shape, missing parts, and blank parts without writing a submission', () => {
    const fixture = setup();
    transitionActivity(db!, fixture.teacherId, fixture.activityId, '搶答進行中');

    for (const payload of [
      { questionNumber: 1, answerParts: ['only one'] },
      { questionNumber: 1, answerParts: ['first', '   '] },
      { questionNumber: 1, answerParts: ['first', 2] },
      { questionNumber: 1, answerParts: ['first', 'second'], extra: true },
      { questionNumber: 0, answerParts: ['first', 'second'] }
    ]) {
      expect(errorFrom(() => submitAnswer(db!, fixture.studentAId, fixture.activityId, payload)))
        .toMatchObject({ status: 400, code: 'INVALID_ANSWER' });
    }
    expect(db!.prepare('SELECT COUNT(*) AS count FROM buzzer_submissions').get()).toEqual({ count: 0 });
  });

  it('returns the original receipt for exact retries, rejects changed retries, and records later groups', () => {
    const fixture = setup();
    transitionActivity(db!, fixture.teacherId, fixture.activityId, '搶答進行中');
    submitAnswer(db!, fixture.studentAId, fixture.activityId, { questionNumber: 1, answerParts: ['hidden one', 'hidden two'] });

    const replay = submitAnswer(db!, fixture.studentAId, fixture.activityId, { questionNumber: 1, answerParts: ['hidden one', 'hidden two'] });
    expect(replay).toMatchObject({ isWinner: true, isReplay: true, answerParts: ['hidden one', 'hidden two'] });
    expect(errorFrom(() => submitAnswer(db!, fixture.studentAId, fixture.activityId, { questionNumber: 1, answerParts: ['retry one', 'retry two'] })))
      .toMatchObject({ status: 409, code: 'DUPLICATE_SUBMISSION' });
    const later = submitAnswer(db!, fixture.studentBId, fixture.activityId, { questionNumber: 1, answerParts: ['other one', 'other two'] });
    expect(later).toMatchObject({ isWinner: false, answerParts: ['other one', 'other two'] });
    expect(db!.prepare(`SELECT group_id AS groupId, submission_rank AS submissionRank, is_winner AS isWinner
      FROM buzzer_submissions WHERE activity_id = ? AND question_number = ? ORDER BY submission_rank`)
      .all(fixture.activityId, 1)).toEqual([
        { groupId: fixture.groupA.groupId, submissionRank: 1, isWinner: 1 },
        { groupId: fixture.groupB.groupId, submissionRank: 2, isWinner: 0 }
      ]);
  });
});
