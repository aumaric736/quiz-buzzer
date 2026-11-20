import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import WebSocket from 'ws';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

const config = { host: '127.0.0.1' as const, port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' };

describe('phase WebSocket and answer-status visibility', () => {
  let db: SqliteDatabase;
  let server: Server;
  let teacherId: string;
  let studentId: string;
  let activityId: string;
  let baseUrl: string;
  let wsUrl: string;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    db = createTestDatabase();
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    teacherId = teacher.sessionId;
    studentId = student.sessionId;
    activityId = createActivity(db, teacherId).activityId;
    db.prepare('INSERT INTO groups (id, activity_id, display_name, normalized_name, joined_at) VALUES (?, ?, ?, ?, ?)').run('group-1', activityId, 'Blue', 'blue', new Date().toISOString());
    db.prepare('UPDATE user_sessions SET activity_id = ?, group_id = ? WHERE id = ?').run(activityId, 'group-1', studentId);
    seedGuidedNotesQuestions(db, activityId);
    const { server: httpServer } = createHttpServer(db, config);
    server = httpServer;
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

  async function connectAndSubscribe(sessionId: string): Promise<WebSocket> {
    const socket = new WebSocket(wsUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const ack = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'activity.subscribe', activityId, sessionId }));
    expect(JSON.parse(await ack)).toMatchObject({ type: 'activity.subscribed', activityId, phase: '準備中', revision: 0 });
    return socket;
  }

  function nextMessage(socket: WebSocket, timeoutMs = 1500): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('WebSocket message timeout')); }, timeoutMs);
      const onMessage = (data: WebSocket.RawData) => { clearTimeout(timer); socket.off('message', onMessage); resolve(data.toString()); };
      socket.on('message', onMessage);
    });
  }

  it('broadcasts committed updates to subscribed teacher and student with increasing revisions', async () => {
    const teacher = await connectAndSubscribe(teacherId);
    const student = await connectAndSubscribe(studentId);
    const teacherUpdate = nextMessage(teacher);
    const studentUpdate = nextMessage(student);
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/phase`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '搶答進行中' })
    });
    expect(response.status).toBe(200);
    const teacherPhase = JSON.parse(await teacherUpdate) as Record<string, unknown>;
    const studentPhase = JSON.parse(await studentUpdate) as Record<string, unknown>;
    expect(teacherPhase).toMatchObject({ type: 'activity.phase.updated', activityId, phase: '搶答進行中', revision: 1 });
    expect(studentPhase).toMatchObject({ type: 'activity.phase.updated', activityId, phase: '搶答進行中', revision: 1 });
    expect(teacherPhase).not.toHaveProperty('answerParts');
    expect(studentPhase).not.toHaveProperty('answerParts');
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });

  it('does not broadcast rejected/uncommitted transitions and returns a generic malformed-message error', async () => {
    const teacher = await connectAndSubscribe(teacherId);
    const malformed = nextMessage(teacher);
    teacher.send('not-json');
    const protocolError = await malformed;
    expect(protocolError).toContain('INVALID_MESSAGE');
    expect(protocolError).not.toContain('not-json');

    const noBroadcast = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => { teacher.off('message', onMessage); resolve(false); }, 150);
      const onMessage = () => { clearTimeout(timer); resolve(true); };
      teacher.once('message', onMessage);
    });
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/phase`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '已結束' })
    });
    expect(response.status).toBe(409);
    expect(await noBroadcast).toBe(false);
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activityId)).toEqual({ phase: '準備中', revision: 0 });
  });

  it('rejects a student subscription when its stored group belongs to another activity', async () => {
    const mismatchedActivityId = createActivity(db, teacherId).activityId;
    db.prepare('UPDATE user_sessions SET activity_id = ? WHERE id = ?').run(mismatchedActivityId, studentId);

    const socket = new WebSocket(wsUrl);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const rejection = nextMessage(socket);
    socket.send(JSON.stringify({ type: 'activity.subscribe', activityId: mismatchedActivityId, sessionId: studentId }));
    expect(JSON.parse(await rejection)).toMatchObject({ type: 'error', code: 'SUBSCRIPTION_DENIED' });
  });

  it('returns an empty preparation/live snapshot to joined students and complete results after end', async () => {
    const status = db.prepare('SELECT phase FROM activities WHERE id=?').get(activityId) as { phase: string };
    expect(status.phase).toBe('準備中');
    const endpoint = () => fetch(`${baseUrl}/api/activities/${activityId}/answer-status`, { headers: { 'X-Local-Session-Id': studentId } });
    expect((await endpoint()).status).toBe(200);
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const hidden = await endpoint();
    expect(hidden.status).toBe(200);
    expect(await hidden.json()).toEqual({ phase: '搶答進行中', items: [] });
    transitionActivity(db, teacherId, activityId, '已結束');
    const visible = await endpoint();
    expect(visible.status).toBe(200);
    expect(await visible.json()).toEqual({ phase: '已結束', items: [{ questionNumber: 1, winner: false }] });
  });
});

