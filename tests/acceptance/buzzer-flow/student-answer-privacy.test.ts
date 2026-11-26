import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroup } from '../../../server/src/features/user-stage-sync/application/group-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

describe('student answer privacy', () => {
  let db: SqliteDatabase; let server: Server; let baseUrl: string;
  let activityId: string; let teacherId: string; let studentId: string; let otherStudentId: string;
  const sockets: WebSocket[] = [];
  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    studentId = createSession(db, 'student').sessionId;
    otherStudentId = createSession(db, 'student').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    enrollGroup(db, studentId, activityId, { mode: 'leader', groupName: 'Private Team A' });
    enrollGroup(db, otherStudentId, activityId, { mode: 'leader', groupName: 'Private Team B' });
    seedGuidedNotesQuestions(db, activityId, [1], 1);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    server = createApp(db).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    sockets.length = 0;
  });
  afterEach(async () => {
    for (const socket of sockets) if (socket.readyState === WebSocket.OPEN) socket.close();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });
  it('keeps live status scoped to the caller group and exposes the complete live view to its owner teacher', async () => {
    await fetch(`${baseUrl}/api/activities/${activityId}/answers`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': otherStudentId }, body: JSON.stringify({ questionNumber: 1, answerParts: ['other group answer'] }) });
    const studentStatus = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentId } });
    const body = await studentStatus.json();
    expect(JSON.stringify(body)).not.toContain('other group answer');
    expect(JSON.stringify(body)).not.toContain('Private Team B');
    expect(JSON.stringify(body)).not.toMatch(/winner|count|sequence|rank|groupId/i);
    const teacherStatus = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': teacherId } });
    expect(JSON.stringify(await teacherStatus.json())).toContain('other group answer');
  });

  it('returns only the requesting group answer on its live status response', async () => {
    await fetch(`${baseUrl}/api/activities/${activityId}/answers`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': studentId }, body: JSON.stringify({ questionNumber: 1, answerParts: ['  original spacing  '] }) });
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentId } });
    expect(await response.json()).toMatchObject({ items: [{ questionNumber: 1, status: 'submitted', answerParts: ['  original spacing  '] }] });
  });

  it('sends answer updates to the teacher socket only', async () => {
    const wsServer = (await import('../../../server/src/app.js')).createHttpServer;
    server.close();
    const http = wsServer(db, { host: '127.0.0.1', port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' });
    server = http.server;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
    const connect = async (sessionId: string) => {
      const socket = new WebSocket(wsUrl); sockets.push(socket);
      await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      const ack = new Promise<string>((resolve) => socket.once('message', (message) => resolve(message.toString())));
      socket.send(JSON.stringify({ type: 'activity.subscribe', activityId, sessionId }));
      await ack;
      return socket;
    };
    const teacher = await connect(teacherId);
    const student = await connect(studentId);
    const teacherEvent = new Promise<string>((resolve) => teacher.once('message', (message) => resolve(message.toString())));
    await fetch(`${serverAddress(server)}/api/activities/${activityId}/answers`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': otherStudentId }, body: JSON.stringify({ questionNumber: 1, answerParts: ['broadcast answer'] }) });
    expect(await teacherEvent).toContain('broadcast answer');
    const studentEvent = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 100);
      student.once('message', () => { clearTimeout(timer); resolve(true); });
    });
    expect(await studentEvent).toBe(false);
  });
});

function serverAddress(server: Server): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
