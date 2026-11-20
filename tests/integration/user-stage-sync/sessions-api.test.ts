import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createTestDatabase } from '../../helpers/sqlite.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import type { Server } from 'node:http';

describe('session API', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    db = createTestDatabase();
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('creates both supported roles and restores their null context', async () => {
    for (const role of ['teacher', 'student']) {
      const created = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ role })
      });
      expect(created.status).toBe(201);
      const session = await created.json() as { sessionId: string; role: string };
      expect(session.role).toBe(role);
      const restored = await fetch(`${baseUrl}/api/sessions/${session.sessionId}`);
      expect(restored.status).toBe(200);
      expect(await restored.json()).toMatchObject({ sessionId: session.sessionId, role, activityId: null, groupId: null });
    }
  });

  it('rejects missing or unknown role values without creating a session', async () => {
    for (const body of [{}, { role: 'admin' }, { role: 3 }, null]) {
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'INVALID_ROLE' });
    }
    expect(db.prepare('SELECT count(*) AS total FROM user_sessions').get()).toEqual({ total: 0 });
  });
});
