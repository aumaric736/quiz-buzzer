import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { recordActivityOperation } from '../../../server/src/features/buzzer-flow/persistence/activity-operation-repository.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('answer receipt ordering', () => {
  let db: SqliteDatabase; let server: Server; let baseUrl: string;
  let activityId: string; let teacherId: string; let studentA: string; let studentB: string; let studentA2: string;
  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentA = createSession(db, 'student').sessionId;
    studentA2 = createSession(db, 'student').sessionId;
    studentB = createSession(db, 'student').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    const teamA = enrollGroup(db, studentA, activityId, { mode: 'leader', groupName: 'Team A' });
    enrollGroup(db, studentA2, activityId, { mode: 'member', inviteCode: teamA.inviteCode });
    enrollGroup(db, studentB, activityId, { mode: 'leader', groupName: 'Team B' });
    seedGuidedNotesQuestions(db, activityId, [1, 2], 1);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });
  const send = (sessionId: string, questionNumber: number, answerParts: string[]) => fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify({ questionNumber, answerParts })
  });

  it('allows different groups to win independent questions and ranks the first accepted receipt', async () => {
    const a1 = await send(studentA, 1, ['A1']);
    const b2 = await send(studentB, 2, ['B2']);
    const b1 = await send(studentB, 1, ['B1']);
    expect([a1.status, b2.status, b1.status]).toEqual([201, 201, 201]);
    expect(db.prepare('SELECT question_number, group_id, is_winner FROM buzzer_submissions ORDER BY receipt_sequence').all())
      .toEqual([
        expect.objectContaining({ question_number: 1, is_winner: 1 }),
        expect.objectContaining({ question_number: 2, is_winner: 1 }),
        expect.objectContaining({ question_number: 1, is_winner: 0 })
      ]);
  });

  it('uses one team eligibility across member sessions and returns the original receipt on exact retry', async () => {
    expect((await send(studentA, 1, ['same'])).status).toBe(201);
    const retry = await send(studentA2, 1, ['same']);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ status: 'already_submitted', answerParts: ['same'] });
    expect((await send(studentA2, 1, ['changed'])).status).toBe(409);
    expect(db.prepare('SELECT count(*) AS total FROM buzzer_submissions WHERE activity_id = ? AND question_number = 1').get(activityId)).toEqual({ total: 1 });
  });

  it('stores durable activity-local sequence numbers without answer content', () => {
    const first = recordActivityOperation(db, activityId, 'answer', '2026-11-26T00:00:00.000Z');
    const second = recordActivityOperation(db, activityId, 'end', '2026-11-26T00:00:00.000Z');
    expect(second).toBe(first + 1);
    expect(db.prepare('SELECT sequence, operation_type FROM activity_operation_receipts WHERE activity_id = ? ORDER BY sequence').all(activityId))
      .toEqual([{ sequence: first, operation_type: 'answer' }, { sequence: second, operation_type: 'end' }]);
  });

  it('serializes an answer and teacher end into one deterministic receipt order', async () => {
    const answerPromise = send(studentA, 1, ['race']);
    const endPromise = fetch(`${baseUrl}/api/activities/${activityId}/phase`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '已結束' }) });
    const [answerResponse, endResponse] = await Promise.all([answerPromise, endPromise]);
    expect(endResponse.status).toBe(200);
    const order = db.prepare('SELECT operation_type FROM activity_operation_receipts WHERE activity_id = ? ORDER BY sequence').all(activityId) as Array<{ operation_type: string }>;
    expect(order).toHaveLength(2);
    if (order[0]?.operation_type === 'answer') {
      expect(answerResponse.status).toBe(201);
      expect(db.prepare('SELECT count(*) AS total FROM buzzer_submissions WHERE activity_id = ?').get(activityId)).toEqual({ total: 1 });
    } else {
      expect(order[0]?.operation_type).toBe('end');
      expect(answerResponse.status).toBe(409);
      expect(db.prepare('SELECT count(*) AS total FROM buzzer_submissions WHERE activity_id = ?').get(activityId)).toEqual({ total: 0 });
    }
  });
});
