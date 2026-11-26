import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('buzzer answer submission API', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let studentIds: string[];
  let activityId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentIds = [createSession(db, 'student').sessionId, createSession(db, 'student').sessionId];
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [1, 2], 2);
    studentIds.forEach((sessionId, index) => enrollGroup(db, sessionId, activityId, `Team ${index + 1}`));
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  function submit(sessionId: string, payload: unknown) {
    return fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(payload)
    });
  }

  function setLive(): void { transitionActivity(db, teacherId, activityId, '搶答進行中'); }

  it('accepts ordered answers after elapsed time while the teacher has not ended the activity', async () => {
    setLive();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const response = await submit(studentIds[0], { questionNumber: 1, answerParts: ['first', 'second'] });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ accepted: true, questionNumber: 1, status: 'accepted' });
    expect(db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId)).toEqual({ phase: '搶答進行中' });
  });

  it('records a later group answer after a winner while rejecting each group duplicate', async () => {
    setLive();
    const first = await submit(studentIds[0], { questionNumber: 1, answerParts: ['first', 'winner'] });
    expect(first.status).toBe(201);
    const later = await submit(studentIds[1], { questionNumber: 1, answerParts: ['later', 'answer'] });
    expect(later.status).toBe(201);
    expect(await later.json()).toMatchObject({ accepted: true, questionNumber: 1, status: 'accepted' });

    expect(db.prepare(`SELECT group_id AS groupId, submission_rank AS submissionRank, is_winner AS isWinner
      FROM buzzer_submissions WHERE activity_id = ? AND question_number = ? ORDER BY submission_rank`).all(activityId, 1))
      .toEqual([
        { groupId: db.prepare('SELECT group_id AS groupId FROM user_sessions WHERE id = ?').get(studentIds[0]).groupId, submissionRank: 1, isWinner: 1 },
        { groupId: db.prepare('SELECT group_id AS groupId FROM user_sessions WHERE id = ?').get(studentIds[1]).groupId, submissionRank: 2, isWinner: 0 }
      ]);

    for (const sessionId of studentIds) {
      const duplicate = await submit(sessionId, { questionNumber: 1, answerParts: ['duplicate', 'answer'] });
      expect(duplicate.status).toBe(409);
      expect(await duplicate.json()).toMatchObject({ code: 'DUPLICATE_SUBMISSION' });
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM buzzer_submissions WHERE activity_id = ? AND question_number = 1').get(activityId))
      .toEqual({ count: 2 });
  });

  it('rejects blank and wrong-count parts without creating a partial winner', async () => {
    setLive();
    for (const payload of [
      { questionNumber: 1, answerParts: ['', 'second'] },
      { questionNumber: 1, answerParts: ['only one'] }
    ]) {
      const response = await submit(studentIds[0], payload);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'INVALID_ANSWER', message: expect.any(String) });
    }
    expect(db.prepare('SELECT COUNT(*) AS count FROM buzzer_submissions').get()).toEqual({ count: 0 });
  });

  it('serializes one hundred competing group submissions to one winner with stable per-question ranks', async () => {
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [1, 2], 2);
    const competitors = Array.from({ length: 100 }, (_, index) => {
      const sessionId = createSession(db, 'student').sessionId;
      enrollGroup(db, sessionId, activityId, `Competitor ${index + 1}`);
      return sessionId;
    });
    setLive();

    const responses = await Promise.all(competitors.map((sessionId) => submit(sessionId, {
      questionNumber: 1, answerParts: ['part one', 'part two']
    })));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(100);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(0);
    expect(db.prepare(`SELECT COUNT(*) AS count, SUM(is_winner) AS winnerCount,
        MIN(submission_rank) AS firstRank, MAX(submission_rank) AS lastRank
      FROM buzzer_submissions WHERE activity_id = ? AND question_number = 1`).get(activityId))
      .toEqual({ count: 100, winnerCount: 1, firstRank: 1, lastRank: 100 });
  });

  it('settles a submission/end race consistently and rejects any later attempt', async () => {
    setLive();
    const submitRequest = submit(studentIds[0], { questionNumber: 1, answerParts: ['race one', 'race two'] });
    const endRequest = fetch(`${baseUrl}/api/activities/${activityId}/phase`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '已結束' })
    });
    const [answerResponse, endResponse] = await Promise.all([submitRequest, endRequest]);
    expect(endResponse.status).toBe(200);
    expect([201, 409]).toContain(answerResponse.status);
    const committedCount = (db.prepare('SELECT COUNT(*) AS count FROM buzzer_submissions WHERE activity_id = ?').get(activityId) as { count: number }).count;
    expect(committedCount).toBe(answerResponse.status === 201 ? 1 : 0);

    const afterEnd = await submit(studentIds[1], { questionNumber: 2, answerParts: ['too late', 'too late'] });
    expect(afterEnd.status).toBe(409);
    expect(await afterEnd.json()).toMatchObject({ code: 'BUZZER_NOT_OPEN' });
  });
});
