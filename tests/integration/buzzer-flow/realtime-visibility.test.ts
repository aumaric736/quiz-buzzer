import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

const config = { host: '127.0.0.1' as const, port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' };

describe('buzzer realtime privacy and recovery', () => {
  let db: SqliteDatabase;
  let server: Server;
  let teacherId: string;
  let studentAId: string;
  let studentBId: string;
  let activityId: string;
  let baseUrl: string;
  let wsUrl: string;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentAId = createSession(db, 'student').sessionId;
    studentBId = createSession(db, 'student').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [2, 5], 2);
    enrollGroup(db, studentAId, activityId, 'Blue Team');
    enrollGroup(db, studentBId, activityId, 'Green Team');
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const instance = createHttpServer(db, config);
    server = instance.server;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    wsUrl = `ws://127.0.0.1:${address.port}/ws`;
    sockets.length = 0;
  });

  afterEach(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  function nextEvent(socket: WebSocket, predicate: (event: Record<string, unknown>) => boolean, timeoutMs = 1500): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('WebSocket event timeout')); }, timeoutMs);
      const onMessage = (data: WebSocket.RawData) => {
        let event: Record<string, unknown>;
        try { event = JSON.parse(data.toString()) as Record<string, unknown>; } catch { return; }
        if (!predicate(event)) return;
        clearTimeout(timer); socket.off('message', onMessage); resolve(event);
      };
      socket.on('message', onMessage);
    });
  }

  async function connectAndSubscribe(sessionId: string): Promise<WebSocket> {
    const socket = new WebSocket(wsUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const ack = nextEvent(socket, (event) => event.type === 'activity.subscribed');
    socket.send(JSON.stringify({ type: 'activity.subscribe', activityId, sessionId }));
    expect(await ack).toMatchObject({ type: 'activity.subscribed', activityId, phase: '搶答進行中', revision: 1 });
    return socket;
  }

  async function expectNoEvent(socket: WebSocket, milliseconds = 150): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('message', onMessage); resolve(); }, milliseconds);
      const onMessage = () => { clearTimeout(timer); socket.off('message', onMessage); reject(new Error('Student received an unexpected live event.')); };
      socket.once('message', onMessage);
    });
  }

  it('sends live winner details to the teacher only and restores authorized status after reconnect', async () => {
    const teacher = await connectAndSubscribe(teacherId);
    const studentA = await connectAndSubscribe(studentAId);
    const studentB = await connectAndSubscribe(studentBId);
    const teacherEvent = nextEvent(teacher, (event) => event.type === 'buzzer.question.updated');
    const startAt = performance.now();
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentAId },
      body: JSON.stringify({ questionNumber: 2, answerParts: ['first', 'second'] })
    });
    expect(response.status).toBe(201);
    expect(await teacherEvent).toMatchObject({
      type: 'buzzer.question.updated', activityId, questionNumber: 2, groupName: 'Blue Team', answerParts: ['first', 'second']
    });
    expect(performance.now() - startAt).toBeLessThan(1000);
    await Promise.all([expectNoEvent(studentA), expectNoEvent(studentB)]);

    const laterAnswer = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentBId },
      body: JSON.stringify({ questionNumber: 2, answerParts: ['later', 'review only'] })
    });
    expect(laterAnswer.status).toBe(201);
    await Promise.all([expectNoEvent(teacher), expectNoEvent(studentA), expectNoEvent(studentB)]);

    const own = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentAId } });
    expect(await own.json()).toMatchObject({ phase: '搶答進行中', items: [{ questionNumber: 2, displayOrder: 0, status: 'submitted', answerParts: ['first', 'second'] }] });
    const other = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentBId } });
    expect(await other.json()).toEqual({ phase: '搶答進行中', items: [{ questionNumber: 2, displayOrder: 0, status: 'submitted', answerParts: ['later', 'review only'] }] });

    studentA.close();
    const restored = await connectAndSubscribe(studentAId);
    expect(restored).toBeTruthy();
    const restoredStatus = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentAId } });
    expect(await restoredStatus.json()).toEqual({ phase: '搶答進行中', items: [{ questionNumber: 2, displayOrder: 0, status: 'submitted', answerParts: ['first', 'second'] }] });

    const endEvents = [teacher, studentB, restored].map((socket) => nextEvent(socket, (event) => event.type === 'activity.phase.updated' && event.phase === '已結束'));
    const ended = await fetch(`${baseUrl}/api/activities/${activityId}/phase`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '已結束' })
    });
    expect(ended.status).toBe(200);
    await Promise.all(endEvents);
    const final = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentBId } });
    expect(await final.json()).toMatchObject({ phase: '已結束', items: expect.arrayContaining([{ questionNumber: 5, winner: false }]) });
  });
});
