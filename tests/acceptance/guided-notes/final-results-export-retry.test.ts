import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { submitAnswer } from '../../../server/src/features/buzzer-flow/application/buzzer-flow-service.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('read-only final results', () => {
  let db: SqliteDatabase; let server: Server; let baseUrl: string; let teacherId: string; let studentId: string; let activityId: string;
  beforeEach(async () => {
    db = createTestDatabase(); teacherId = createSession(db, 'teacher').sessionId; studentId = createSession(db, 'student').sessionId;
    activityId = createActivity(db, teacherId).activityId; enrollGroup(db, studentId, activityId, { mode: 'leader', groupName: 'Winner' });
    seedGuidedNotesQuestions(db, activityId, [1, 2], 1);
    server = createApp(db).listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); db.close(); });

  it('rejects live lookup, then returns immutable winner and no-winner results by activity code alone', async () => {
    const endpoint = `${baseUrl}/api/activities/${activityId}/final-results`;
    expect((await fetch(endpoint)).status).toBe(409);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    submitAnswer(db, studentId, activityId, { questionNumber: 1, answerParts: ['final answer'] });
    transitionActivity(db, teacherId, activityId, '已結束');
    const response = await fetch(endpoint);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ phase: '已結束', items: [
      { questionNumber: 1, winner: true, winningGroupName: 'Winner', answerParts: ['final answer'] },
      { questionNumber: 2, winner: false }
    ] });
    expect((await fetch(`${endpoint}`, { method: 'POST' })).status).toBe(404);
    expect(db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId)).toEqual({ phase: '已結束' });
  });
});
