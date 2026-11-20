import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { submitBuzzerAnswer, getBuzzerQuestions } from '../../../client/src/features/buzzer-flow/services/buzzer-flow-api.js';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('student answer flow acceptance', () => {
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
    seedGuidedNotesQuestions(db, activityId, [2, 5], 2);
    enrollGroup(db, studentId, activityId, 'Blue Team');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('loads the imported question numbers and accepts an ordered answer only after the teacher opens the buzzer', async () => {
    expect(await getBuzzerQuestions(studentId, activityId, baseUrl)).toEqual({
      questions: [{ questionNumber: 2, blankCount: 2 }, { questionNumber: 5, blankCount: 2 }]
    });
    await expect(submitBuzzerAnswer(studentId, activityId, { questionNumber: 2, answerParts: ['first', 'second'] }, baseUrl))
      .rejects.toThrow('目前不是搶答進行中');

    transitionActivity(db, teacherId, activityId, '搶答進行中');
    expect(await submitBuzzerAnswer(studentId, activityId, { questionNumber: 2, answerParts: ['first', 'second'] }, baseUrl))
      .toEqual({ accepted: true, questionNumber: 2 });
    await expect(submitBuzzerAnswer(studentId, activityId, { questionNumber: 2, answerParts: ['retry', 'retry'] }, baseUrl))
      .rejects.toThrow('第一次受理的答案不會被覆寫');
  });

  it('shows a field error for a whitespace-only blank and leaves the question available', async () => {
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    await expect(submitBuzzerAnswer(studentId, activityId, { questionNumber: 2, answerParts: ['   ', 'second'] }, baseUrl))
      .rejects.toThrow('每個填空都必須輸入非空白答案');
    expect(db.prepare('SELECT COUNT(*) AS count FROM buzzer_submissions').get()).toEqual({ count: 0 });
  });
});
