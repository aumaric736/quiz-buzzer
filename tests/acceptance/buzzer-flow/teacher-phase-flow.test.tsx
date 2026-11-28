import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createHttpServer } from '../../../server/src/app.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { openDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';

describe('teacher phase flow acceptance', () => {
  let db: SqliteDatabase | undefined;
  let server: Server | undefined;
  let sockets: WebSocket[] = [];

  afterEach(async () => {
    for (const socket of sockets) socket.close();
    sockets = [];
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    db?.close(); db = undefined; server = undefined;
  });

  function eventPromise(socket: WebSocket, predicate: (event: Record<string, unknown>) => boolean, timeoutMs = 1500): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('Timed out waiting for phase event.')); }, timeoutMs);
      const onMessage = (data: WebSocket.RawData) => {
        let event: Record<string, unknown>;
        try { event = JSON.parse(data.toString()) as Record<string, unknown>; } catch { return; }
        if (!predicate(event)) return;
        clearTimeout(timer);
        socket.off('message', onMessage);
        resolve(event);
      };
      socket.on('message', onMessage);
    });
  }

  async function connectSession(wsUrl: string, sessionId: string, activityId: string): Promise<WebSocket> {
    const socket = new WebSocket(wsUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => {
        const subscribed = eventPromise(socket, (event) => event.type === 'activity.subscribed');
        socket.send(JSON.stringify({ type: 'activity.subscribe', sessionId, activityId }));
        void subscribed.then(() => resolve(), reject);
      });
      socket.once('error', reject);
    });
    return socket;
  }

  function addOneBlankQuestion(activityId: string): void {
    const now = new Date().toISOString();
    db!.prepare('INSERT INTO activity_questions (id, activity_id, question_number, created_at) VALUES (?, ?, ?, ?)')
      .run('question-1', activityId, 1, now);
    db!.prepare(`INSERT INTO guided_notes_sources
      (id, activity_id, spreadsheet_id, sheet_id, sheet_title, structure_fingerprint, imported_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('source-1', activityId, 'sheet-123456789', 7, 'Sample', 'fingerprint', now, now);
    db!.prepare(`INSERT INTO guided_notes_blank_mappings
      (source_id, activity_id, question_number, slot_order, row_index, column_index, blank_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('source-1', activityId, 1, 0, 1, 2, 'text');
  }

  it('manually controls the phase and synchronizes connected teacher and student views within the specified system latency', async () => {
    db = openDatabase(':memory:');
    const teacherId = createSession(db, 'teacher').sessionId;
    const studentId = createSession(db, 'student').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    enrollGroup(db, studentId, activityId, 'Blue');
    addOneBlankQuestion(activityId);

    const started = createHttpServer(db, { host: '127.0.0.1', port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' });
    server = started.server;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const apiUrl = `http://127.0.0.1:${address.port}`;
    const wsUrl = `ws://127.0.0.1:${address.port}/ws`;
    const teacherSocket = await connectSession(wsUrl, teacherId, activityId);
    const studentSocket = await connectSession(wsUrl, studentId, activityId);

    const startEvents = [teacherSocket, studentSocket].map((socket) => eventPromise(socket, (event) => event.type === 'activity.phase.updated' && event.phase === '搶答進行中'));
    const startAt = performance.now();
    const startResponse = await fetch(`${apiUrl}/api/activities/${activityId}/phase`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '搶答進行中' })
    });
    expect(startResponse.status).toBe(200);
    expect(performance.now() - startAt).toBeLessThan(2000);
    await Promise.all(startEvents);
    expect(performance.now() - startAt).toBeLessThan(1000);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId)).toEqual({ phase: '搶答進行中' });

    const endEvents = [teacherSocket, studentSocket].map((socket) => eventPromise(socket, (event) => event.type === 'activity.phase.updated' && event.phase === '已結束'));
    const endAt = performance.now();
    const endResponse = await fetch(`${apiUrl}/api/activities/${activityId}/phase`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '已結束' })
    });
    expect(endResponse.status).toBe(200);
    expect(performance.now() - endAt).toBeLessThan(2000);
    await Promise.all(endEvents);
    expect(performance.now() - endAt).toBeLessThan(1000);
  });
});
