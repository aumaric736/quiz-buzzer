import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('teacher setup acceptance flow', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let server: Server;
  let baseUrl: string;
  beforeEach(async () => {
    db = createTestDatabase();
    server = createApp(db, undefined, undefined, { teacherCredentials: { username: 'teacher', password: 'teacher-password' } }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('signs in, creates the join-code activity, and attaches imported questions to it', async () => {
    const signedIn = await fetch(`${baseUrl}/api/teacher/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'teacher', password: 'teacher-password' }) });
    const session = await signedIn.json() as { sessionId: string };
    const created = await fetch(`${baseUrl}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': session.sessionId }, body: '{}' });
    const activity = await created.json() as { activityId: string; phase: string };
    seedGuidedNotesQuestions(db, activity.activityId, [1, 2]);
    expect(activity.phase).toBe('準備中');
    expect(db.prepare('SELECT count(*) AS count FROM activity_questions WHERE activity_id = ?').get(activity.activityId)).toEqual({ count: 2 });
  });
});
