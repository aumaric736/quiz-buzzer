import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { markTeacherDisconnected, reconcileExpiredTeacherPresence, restoreTeacherPresence } from '../../../server/src/features/user-stage-sync/application/teacher-presence-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('teacher presence and activity end', () => {
  let db: SqliteDatabase; let server: Server; let baseUrl: string; let teacherId: string; let activityId: string;
  beforeEach(async () => {
    db = createTestDatabase(); teacherId = createSession(db, 'teacher').sessionId; activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [1]); transitionActivity(db, teacherId, activityId, '搶答進行中');
    server = createApp(db).listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => { if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); db.close(); });

  it('restores the owner inside two minutes and ends the activity when the deadline expires', async () => {
    const disconnected = new Date('2026-11-26T02:00:00.000Z');
    markTeacherDisconnected(db, teacherId, disconnected);
    expect(await restoreTeacherPresence(db, teacherId, new Date(disconnected.getTime() + 119_999))).toBe(true);
    markTeacherDisconnected(db, teacherId, disconnected);
    expect(reconcileExpiredTeacherPresence(db, new Date(disconnected.getTime() + 120_000))).toBe(1);
    expect(db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId)).toEqual({ phase: '已結束' });
    expect(db.prepare('SELECT COUNT(*) AS total FROM activity_operation_receipts WHERE activity_id = ? AND operation_type = ?').get(activityId, 'end')).toEqual({ total: 1 });
  });

  it('ends immediately when the teacher explicitly leaves', async () => {
    const response = await fetch(`${baseUrl}/api/sessions/${teacherId}/reset-context`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId)).toEqual({ phase: '已結束' });
  });
});
