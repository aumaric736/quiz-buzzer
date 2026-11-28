import { afterEach, describe, expect, it } from 'vitest';
import { createWinningAnswerProvider } from '../../../server/src/features/buzzer-flow/application/winning-answer-provider.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { submitAnswer } from '../../../server/src/features/buzzer-flow/application/buzzer-flow-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('persisted Guided Notes winning answer provider', () => {
  let db: SqliteDatabase | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  function fixture() {
    db = createTestDatabase();
    const teacherId = createSession(db, 'teacher').sessionId;
    const studentId = createSession(db, 'student').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [2, 5], 2);
    const group = enrollGroup(db, studentId, activityId, 'Blue Team');
    return { teacherId, studentId, activityId, group };
  }

  it('returns every imported question in order, including explicit no-winner entries, only after end', async () => {
    const { teacherId, studentId, activityId, group } = fixture();
    const provider = createWinningAnswerProvider(db!);
    await expect(provider.getResults(activityId)).rejects.toMatchObject({ code: 'BUZZER_NOT_ENDED' });
    transitionActivity(db!, teacherId, activityId, '搶答進行中');
    submitAnswer(db!, studentId, activityId, { questionNumber: 2, answerParts: ['first', 'second'] });
    transitionActivity(db!, teacherId, activityId, '已結束');

    await expect(provider.getResults(activityId)).resolves.toEqual([
      { questionNumber: 2, winner: true, winningGroupId: group.groupId, winningGroupName: 'Blue Team', answerParts: ['first', 'second'] },
      { questionNumber: 5, winner: false }
    ]);
  });

  it('rejects persisted winner data with an answer-part count mismatch or blank part', async () => {
    const { teacherId, studentId, activityId } = fixture();
    transitionActivity(db!, teacherId, activityId, '搶答進行中');
    submitAnswer(db!, studentId, activityId, { questionNumber: 2, answerParts: ['first', 'second'] });
    transitionActivity(db!, teacherId, activityId, '已結束');
    const provider = createWinningAnswerProvider(db!);

    db!.prepare('UPDATE buzzer_submissions SET answer_parts_json = ? WHERE question_number = ?').run('["only one"]', 2);
    await expect(provider.getResults(activityId)).rejects.toMatchObject({ code: 'ANSWER_RESULT_INVALID' });
    db!.prepare('UPDATE buzzer_submissions SET answer_parts_json = ? WHERE question_number = ?').run('[" ","second"]', 2);
    await expect(provider.getResults(activityId)).rejects.toMatchObject({ code: 'ANSWER_RESULT_INVALID' });
  });

  it('returns only the first winning answer when later groups also submit for review history', async () => {
    const { teacherId, studentId, activityId } = fixture();
    const laterStudentId = createSession(db!, 'student').sessionId;
    enrollGroup(db!, laterStudentId, activityId, 'Green Team');
    transitionActivity(db!, teacherId, activityId, '搶答進行中');
    submitAnswer(db!, studentId, activityId, { questionNumber: 2, answerParts: ['first', 'winner'] });
    submitAnswer(db!, laterStudentId, activityId, { questionNumber: 2, answerParts: ['later', 'answer'] });
    transitionActivity(db!, teacherId, activityId, '已結束');

    await expect(createWinningAnswerProvider(db!).getResults(activityId)).resolves.toEqual([
      { questionNumber: 2, winner: true, winningGroupName: 'Blue Team', winningGroupId: expect.any(String), answerParts: ['first', 'winner'] },
      { questionNumber: 5, winner: false }
    ]);
  });

  it('rejects an answer history whose submissions have no valid winner marker', async () => {
    const { teacherId, studentId, activityId } = fixture();
    const laterStudentId = createSession(db!, 'student').sessionId;
    enrollGroup(db!, laterStudentId, activityId, 'Green Team');
    transitionActivity(db!, teacherId, activityId, '搶答進行中');
    submitAnswer(db!, studentId, activityId, { questionNumber: 2, answerParts: ['first', 'winner'] });
    submitAnswer(db!, laterStudentId, activityId, { questionNumber: 2, answerParts: ['later', 'answer'] });
    transitionActivity(db!, teacherId, activityId, '已結束');
    db!.prepare('UPDATE buzzer_submissions SET is_winner = 0 WHERE activity_id = ? AND question_number = ?')
      .run(activityId, 2);

    await expect(createWinningAnswerProvider(db!).getResults(activityId)).rejects.toMatchObject({
      status: 409, code: 'ANSWER_RESULT_INVALID'
    });
  });

  it('rejects a later-ranked submission marked as the winner', async () => {
    const { teacherId, studentId, activityId } = fixture();
    const laterStudentId = createSession(db!, 'student').sessionId;
    enrollGroup(db!, laterStudentId, activityId, 'Green Team');
    transitionActivity(db!, teacherId, activityId, '搶答進行中');
    submitAnswer(db!, studentId, activityId, { questionNumber: 2, answerParts: ['first', 'rank one'] });
    submitAnswer(db!, laterStudentId, activityId, { questionNumber: 2, answerParts: ['later', 'rank two'] });
    transitionActivity(db!, teacherId, activityId, '已結束');
    db!.prepare('UPDATE buzzer_submissions SET is_winner = 0 WHERE activity_id = ? AND question_number = ? AND submission_rank = 1')
      .run(activityId, 2);
    db!.prepare('UPDATE buzzer_submissions SET is_winner = 1 WHERE activity_id = ? AND question_number = ? AND submission_rank = 2')
      .run(activityId, 2);

    await expect(createWinningAnswerProvider(db!).getResults(activityId)).rejects.toMatchObject({
      status: 409, code: 'ANSWER_RESULT_INVALID'
    });
  });

  it('rejects malformed persisted answer parts and a missing activity with clear provider errors', async () => {
    const { teacherId, studentId, activityId } = fixture();
    transitionActivity(db!, teacherId, activityId, '搶答進行中');
    submitAnswer(db!, studentId, activityId, { questionNumber: 2, answerParts: ['first', 'second'] });
    transitionActivity(db!, teacherId, activityId, '已結束');
    const provider = createWinningAnswerProvider(db!);

    db!.prepare('UPDATE buzzer_submissions SET answer_parts_json = ? WHERE question_number = ?').run('["first",null]', 2);
    await expect(provider.getResults(activityId)).rejects.toMatchObject({ code: 'ANSWER_RESULT_INVALID' });
    await expect(provider.getResults('missing-activity')).rejects.toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
  });
});
