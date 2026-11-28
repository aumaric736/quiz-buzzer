import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../../server/src/app.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createLiveTeamTestHarness, type LiveTeamTestHarness } from '../../helpers/live-team-activity.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

const config = { host: '127.0.0.1' as const, port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' };

describe('live team activity events', () => {
  let db: SqliteDatabase;
  let server: Server;
  let harness: LiveTeamTestHarness;
  let activityId: string;
  let teacherId: string;
  let baseUrl: string;
  let wsUrl: string;

  beforeEach(async () => {
    db = createTestDatabase();
    harness = createLiveTeamTestHarness();
    teacherId = createSession(db, 'teacher').sessionId;
    const teacherActivity = createActivity(db, teacherId);
    activityId = teacherActivity.activityId;
    seedGuidedNotesQuestions(db, activityId, [1]);
    const created = createHttpServer(db, config);
    server = created.server;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
  });

  afterEach(async () => {
    await harness.closeSockets();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function subscribe(sessionId: string) {
    const socket = await harness.connect(wsUrl);
    const ack = harness.nextMessage(socket);
    const snapshot = harness.nextMessage(socket);
    socket.send(JSON.stringify({ type: 'activity.subscribe', activityId, sessionId }));
    expect(JSON.parse(await ack)).toMatchObject({ type: 'activity.subscribed', activityId });
    return { socket, snapshot: JSON.parse(await snapshot) as Record<string, unknown> };
  }

  async function enroll(sessionId: string, body: Record<string, string>) {
    return fetch(`${baseUrl}/api/activities/${activityId}/groups`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(body)
    });
  }

  it('publishes monotonic roster/presence and answer revisions only to the authorized audience', async () => {
    const teacher = await subscribe(teacherId);
    expect(teacher.snapshot).toMatchObject({ type: 'activity.roster.updated', activityLiveRevision: 0, groups: [] });

    const openingEvent = harness.nextMessage(teacher.socket);
    const opened = await fetch(`${baseUrl}/api/activities/${activityId}/open-joining`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: '{}'
    });
    expect(opened.status).toBe(200);
    expect(JSON.parse(await openingEvent)).toMatchObject({ type: 'activity.roster.updated', activityLiveRevision: 1, groups: [] });

    const blueLeaderId = createSession(db, 'student').sessionId;
    const teacherCreated = harness.nextMessage(teacher.socket);
    const blueLeaderResponse = await enroll(blueLeaderId, { mode: 'leader', groupName: 'Blue' });
    expect(blueLeaderResponse.status).toBe(201);
    const blueLeader = await blueLeaderResponse.json() as { groupId: string; inviteCode: string; groupLiveRevision: number };
    expect(blueLeader.groupLiveRevision).toBe(1);
    expect(JSON.parse(await teacherCreated)).toMatchObject({ type: 'activity.roster.updated', activityLiveRevision: 2,
      groups: [expect.objectContaining({ groupId: blueLeader.groupId, onlineCount: 1, joinStatus: '開放加入' })] });

    const leaderSocket = await subscribe(blueLeaderId);
    const blueMemberId = createSession(db, 'student').sessionId;
    const leaderPresence = harness.nextMessage(leaderSocket.socket);
    const teacherJoined = harness.nextMessage(teacher.socket);
    const blueMemberResponse = await enroll(blueMemberId, { mode: 'member', inviteCode: blueLeader.inviteCode });
    expect(blueMemberResponse.status).toBe(201);
    expect(JSON.parse(await leaderPresence)).toMatchObject({ type: 'team.presence.updated', groupId: blueLeader.groupId,
      groupLiveRevision: 2, groupRole: 'leader', onlineCount: 2, occupiedCount: 2 });
    expect(JSON.parse(await teacherJoined)).toMatchObject({ type: 'activity.roster.updated', activityLiveRevision: 3,
      groups: [expect.objectContaining({ groupId: blueLeader.groupId, onlineCount: 2, joinStatus: '額滿' })] });
    const blueMember = await subscribe(blueMemberId);
    expect(blueMember.snapshot).toMatchObject({ type: 'team.presence.updated', groupId: blueLeader.groupId,
      groupLiveRevision: 2, groupRole: 'member' });

    const greenId = createSession(db, 'student').sessionId;
    const greenCreated = harness.nextMessage(teacher.socket);
    const greenResponse = await enroll(greenId, { mode: 'leader', groupName: 'Green' });
    expect(greenResponse.status).toBe(201);
    const greenGroup = await greenResponse.json() as { groupId: string };
    expect(JSON.parse(await greenCreated)).toMatchObject({ type: 'activity.roster.updated', activityLiveRevision: 4 });
    const green = await subscribe(greenId);
    expect(green.snapshot).toMatchObject({ type: 'team.presence.updated', groupId: greenGroup.groupId });

    const phaseEvent = harness.nextMessage(teacher.socket);
    const stoppedRosterEvent = harness.nextMessage(teacher.socket);
    const leaderPhaseEvent = harness.nextMessage(leaderSocket.socket);
    const memberPhaseEvent = harness.nextMessage(blueMember.socket);
    const greenPhaseEvent = harness.nextMessage(green.socket);
    const started = await fetch(`${baseUrl}/api/activities/${activityId}/phase`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId }, body: JSON.stringify({ phase: '搶答進行中' }) });
    expect(started.status).toBe(200);
    expect(JSON.parse(await phaseEvent)).toMatchObject({ type: 'activity.phase.updated', phase: '搶答進行中' });
    expect(JSON.parse(await stoppedRosterEvent)).toMatchObject({ type: 'activity.roster.updated',
      groups: expect.arrayContaining([expect.objectContaining({ groupId: blueLeader.groupId, joinStatus: '停止加入' })]) });
    await Promise.all([leaderPhaseEvent, memberPhaseEvent, greenPhaseEvent]);
    const teacherLegacyAnswer = harness.nextMessage(teacher.socket);
    const teacherAnswer = harness.nextMessage(teacher.socket);
    const leaderAnswer = harness.nextMessage(leaderSocket.socket);
    const memberAnswer = harness.nextMessage(blueMember.socket);
    const leakedGreenAnswer = harness.nextMessage(green.socket, 300);
    const response = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': blueMemberId },
      body: JSON.stringify({ questionNumber: 1, answerParts: ['shared answer'] })
    });
    expect(response.status).toBe(201);
    expect(JSON.parse(await teacherLegacyAnswer)).toMatchObject({ type: 'buzzer.question.updated', groupId: blueLeader.groupId });
    expect(JSON.parse(await teacherAnswer)).toMatchObject({ type: 'activity.team-answer.updated', activityLiveRevision: 5,
      groupId: blueLeader.groupId, questionNumber: 1, answerParts: ['shared answer'],
      questionProgress: { questionNumber: 1, answeredGroupCount: 1, totalGroupCount: 2,
        answeredGroups: [{ groupId: blueLeader.groupId, answerParts: ['shared answer'], submissionRank: 1 }] } });
    expect(JSON.parse(await leaderAnswer)).toMatchObject({ type: 'team.answer.updated', groupLiveRevision: 3,
      groupId: blueLeader.groupId, questionNumber: 1, answerParts: ['shared answer'] });
    expect(JSON.parse(await memberAnswer)).toMatchObject({ type: 'team.answer.updated', groupLiveRevision: 3,
      groupId: blueLeader.groupId, questionNumber: 1, answerParts: ['shared answer'] });
    await expect(leakedGreenAnswer).rejects.toThrow('WebSocket message was not received');
  });
});
