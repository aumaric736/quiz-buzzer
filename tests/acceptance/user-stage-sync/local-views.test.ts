import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import type { ActivitySnapshot } from '../../../shared/src/user-stage-sync/contracts.js';
import { connectActivitySocket, type ActivitySocketEvent } from '../../../client/src/features/user-stage-sync/services/activity-socket.js';

describe('local view reconnection acceptance', () => {
  let db: SqliteDatabase;
  let server: ReturnType<typeof createHttpServer>['server'];
  let socketServer: ReturnType<typeof createHttpServer>['sockets'];
  let subscription: { close: () => void } | undefined;

  afterEach(async () => {
    subscription?.close();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db?.close();
  });

  it('recovers the latest phase after a disconnect within three seconds and ignores stale events', async () => {
    db = createTestDatabase();
    const teacherId = createSession(db, 'teacher').sessionId;
    const studentId = createSession(db, 'student').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    enrollGroup(db, studentId, activityId, 'Blue');
    seedGuidedNotesQuestions(db, activityId);
    const started = createHttpServer(db, { host: '127.0.0.1', port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' });
    server = started.server;
    socketServer = started.sockets;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;
    let latestRevision = 0;
    let latestPhase = '準備中';
    const initialSync = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('initial sync timeout')), 1500);
      subscription = connectActivitySocket(studentId, activityId, -1, (event: ActivitySocketEvent) => {
        latestRevision = event.revision; latestPhase = event.phase;
        if (event.type === 'activity.subscribed' && event.revision === 0) { clearTimeout(timer); resolve(); }
      }, () => undefined, async (): Promise<ActivitySnapshot> => {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/activities/${activityId}`, { headers: { 'X-Local-Session-Id': studentId } });
        return response.json() as Promise<ActivitySnapshot>;
      }, wsUrl);
    });
    await initialSync;

    const recovery = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('recovery exceeded three seconds')), 3000);
      const check = setInterval(() => {
        if (latestPhase === '搶答進行中' && latestRevision === 1) { clearTimeout(timer); clearInterval(check); resolve(); }
      }, 20);
    });
    const disconnectedAt = performance.now();
    const serverClient = [...socketServer.clients][0];
    serverClient?.terminate();
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    await recovery;
    expect(performance.now() - disconnectedAt).toBeLessThan(3000);

    const reconnectedServerClient = [...socketServer.clients][0];
    reconnectedServerClient?.send(JSON.stringify({ type: 'activity.phase.updated', activityId, phase: '準備中', revision: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect({ latestPhase, latestRevision }).toEqual({ latestPhase: '搶答進行中', latestRevision: 1 });
  });
});
