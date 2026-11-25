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
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ReturnToRoleControl } from '../../../client/src/features/user-stage-sync/components/ReturnToRoleControl.js';
import { ApiError, retireBeforeClearingSession } from '../../../client/src/features/user-stage-sync/services/session-api.js';
import { ApplicationShell } from '../../../client/src/features/user-stage-sync/components/ApplicationShell.js';

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

  it('clears the saved browser id only after retirement succeeds and keeps failures retryable', async () => {
    const sequence: string[] = [];
    await retireBeforeClearingSession('session-1', async () => { sequence.push('retired'); }, () => sequence.push('cleared'));
    expect(sequence).toEqual(['retired', 'cleared']);

    sequence.length = 0;
    await expect(retireBeforeClearingSession('session-2', async () => { throw new Error('offline'); }, () => sequence.push('cleared')))
      .rejects.toThrow('offline');
    expect(sequence).toEqual([]);

    await expect(retireBeforeClearingSession('missing', async () => { throw new ApiError('missing', 'SESSION_NOT_FOUND', 404); }, () => sequence.push('cleared'))).resolves.toBeUndefined();
    expect(sequence).toEqual(['cleared']);
  });

  it('keeps the role-return button in rendered shell output across teacher and student flow states', () => {
    const flowStates = [
      'teacher-before-activity', 'teacher-preparation', 'teacher-live', 'teacher-ended',
      'student-before-enrollment', 'student-joined-preparation', 'student-joined-live', 'student-joined-ended'
    ];
    for (const flowState of flowStates) {
      const markup = renderToStaticMarkup(createElement(ApplicationShell, {
        roleReturnVisible: true,
        onReturned: () => undefined,
        children: createElement('section', { 'data-flow-state': flowState }, flowState)
      }));
      expect(markup).toContain(`data-flow-state="${flowState}"`);
      expect(markup).toContain('返回角色選擇');
    }
  });

  it('offers the role-return action and retires the old session before a context-free role can be selected', async () => {
    const control = renderToStaticMarkup(createElement(ReturnToRoleControl, { visible: true, onReturned: () => undefined }));
    expect(control).toContain('返回角色選擇');
    expect(control).toContain('button');

    db = createTestDatabase();
    const teacher = createSession(db, 'teacher');
    const student = createSession(db, 'student');
    const activity = createActivity(db, teacher.sessionId);
    const group = enrollGroup(db, student.sessionId, activity.activityId, 'Reserved Group');
    seedGuidedNotesQuestions(db, activity.activityId);
    transitionActivity(db, teacher.sessionId, activity.activityId, '搶答進行中');
    const serverApp = createHttpServer(db, { host: '127.0.0.1', port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' });
    server = serverApp.server;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const resetStartedAt = performance.now();
    const reset = await fetch(`${baseUrl}/api/sessions/${student.sessionId}/reset-context`, { method: 'POST' });
    const resetElapsedMs = performance.now() - resetStartedAt;
    expect(resetElapsedMs).toBeLessThan(3000);
    console.info(`Role reset API response: ${resetElapsedMs.toFixed(1)} ms`);
    expect(reset.status).toBe(200);
    const oldRestore = await fetch(`${baseUrl}/api/sessions/${student.sessionId}`);
    expect(oldRestore.status).toBe(404);
    expect(db.prepare('SELECT id FROM groups WHERE id = ?').get(group.groupId)).toEqual({ id: group.groupId });
    expect(db.prepare('SELECT count(*) AS total FROM groups WHERE activity_id = ? AND normalized_name = ?')
      .get(activity.activityId, 'reserved group')).toEqual({ total: 1 });
    const replacement = createSession(db, 'student');
    expect(replacement).toMatchObject({ role: 'student', activityId: null, groupId: null });
    expect(replacement.sessionId).not.toBe(student.sessionId);
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activity.activityId))
      .toEqual({ phase: '搶答進行中', revision: 1 });
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
