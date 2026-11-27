import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createTestDatabase } from '../../helpers/sqlite.js';

describe('configured teacher authentication', () => {
  let db: ReturnType<typeof createTestDatabase>;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = createTestDatabase();
    server = createApp(db, undefined, undefined, { teacherCredentials: { username: 'teacher', password: 'correct horse battery' } }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('issues an authenticated teacher session and allows that owner to create an activity', async () => {
    const login = await fetch(`${baseUrl}/api/teacher/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'teacher', password: 'correct horse battery' }) });
    expect(login.status).toBe(200);
    const session = await login.json() as { sessionId: string; role: string };
    expect(session.role).toBe('teacher');
    const activity = await fetch(`${baseUrl}/api/activities`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': session.sessionId }, body: '{}' });
    expect(activity.status).toBe(201);
  });

  it('returns one generic error for unknown users and wrong passwords', async () => {
    const request = (username: string, password: string) => fetch(`${baseUrl}/api/teacher/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
    const unknown = await request('unknown', 'wrong');
    const mismatch = await request('teacher', 'wrong');
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual(await mismatch.json());
  });

  it('does not expose a public teacher-role session creation path', async () => {
    const response = await fetch(`${baseUrl}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role: 'teacher' }) });
    expect(response.status).toBe(403);
  });
});
