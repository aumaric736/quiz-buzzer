import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHttpServer } from '../../../server/src/app.js';
import { createActivity, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { createLiveTeamTestHarness, type LiveTeamTestHarness } from '../../helpers/live-team-activity.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

const config = { host: '127.0.0.1' as const, port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' };

describe('live activity WebSocket snapshots', () => {
  let db: SqliteDatabase;
  let server: Server;
  let harness: LiveTeamTestHarness;
  let activityId: string;
  let teacherId: string;
  let blueGroupId: string;
  let blueStudentId: string;
  let greenGroupId: string;
  let greenStudentId: string;
  let wsUrl: string;
  let baseUrl: string;

  beforeEach(async () => {
    db = createTestDatabase();
    harness = createLiveTeamTestHarness();
    teacherId = createSession(db, 'teacher').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    blueStudentId = createSession(db, 'student').sessionId;
    greenStudentId = createSession(db, 'student').sessionId;
    const blue = enrollGroup(db, blueStudentId, activityId, { mode: 'leader', groupName: 'Blue' });
    const green = enrollGroup(db, greenStudentId, activityId, { mode: 'leader', groupName: 'Green' });
    blueGroupId = blue.groupId;
    greenGroupId = green.groupId;
    seedGuidedNotesQuestions(db, activityId, [1, 2]);
    const insertAnswer = db.prepare(`INSERT INTO buzzer_submissions
      (activity_id, question_number, group_id, answer_parts_json, accepted_at, submission_rank, is_winner)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertAnswer.run(activityId, 1, blueGroupId, '["Blue answer"]', '2026-01-01T00:00:00.000Z', 1, 1);
    insertAnswer.run(activityId, 2, greenGroupId, '["Green answer"]', '2026-01-01T00:00:01.000Z', 1, 1);

    const created = createHttpServer(db, config);
    server = created.server;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    wsUrl = `ws://127.0.0.1:${port}/ws`;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await harness.closeSockets();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function subscribe(sessionId: string) {
    const socket = await harness.connect(wsUrl);
    const subscribed = harness.nextMessage(socket);
    const snapshot = harness.nextMessage(socket);
    socket.send(JSON.stringify({ type: 'activity.subscribe', activityId, sessionId }));
    expect(JSON.parse(await subscribed)).toMatchObject({ type: 'activity.subscribed', activityId });
    return { socket, snapshot: JSON.parse(await snapshot) as Record<string, unknown> };
  }

  it('sends the authenticated teacher an activity-wide roster and answer snapshot', async () => {
    const { snapshot: rawSnapshot } = await subscribe(teacherId);
    const snapshot = rawSnapshot as {
      type: string; activityId: string; activityLiveRevision: number;
      groups: Array<{ groupId: string; leaderOnline: boolean; answers: Array<{ questionNumber: number; status: string; answerParts?: string[] }> }>;
    };
    expect(snapshot).toMatchObject({ type: 'activity.roster.updated', activityId, activityLiveRevision: 2 });
    expect(snapshot.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ groupId: blueGroupId, leaderOnline: true, answers: expect.arrayContaining([expect.objectContaining({ questionNumber: 1, displayOrder: 0, status: 'submitted', answerParts: ['Blue answer'] })]) }),
      expect.objectContaining({ groupId: greenGroupId, leaderOnline: true, answers: expect.arrayContaining([expect.objectContaining({ questionNumber: 2, displayOrder: 1, status: 'submitted', answerParts: ['Green answer'] })]) })
    ]));
  });

  it('sends each student only its own team presence and submitted answers', async () => {
    const { snapshot: rawBlueSnapshot } = await subscribe(blueStudentId);
    const blueSnapshot = rawBlueSnapshot as {
      type: string; groupId: string; groupRole: string; answers: Array<{ questionNumber: number; status: string; answerParts?: string[] }>;
    };
    expect(blueSnapshot).toMatchObject({ type: 'team.presence.updated', groupId: blueGroupId, groupRole: 'leader' });
    expect(blueSnapshot.answers).toContainEqual({ questionNumber: 1, displayOrder: 0, status: 'submitted', answerParts: ['Blue answer'] });
    expect(blueSnapshot.answers).not.toContainEqual(expect.objectContaining({ questionNumber: 2, answerParts: ['Green answer'] }));

    const { snapshot: rawGreenSnapshot } = await subscribe(greenStudentId);
    const greenSnapshot = rawGreenSnapshot as {
      type: string; groupId: string; answers: Array<{ questionNumber: number; status: string; answerParts?: string[] }>;
    };
    expect(greenSnapshot.groupId).toBe(greenGroupId);
    expect(greenSnapshot.answers).toContainEqual({ questionNumber: 2, displayOrder: 1, status: 'submitted', answerParts: ['Green answer'] });
    expect(greenSnapshot.answers).not.toContainEqual(expect.objectContaining({ questionNumber: 1, answerParts: ['Blue answer'] }));
  });

  it('publishes explicit leader return to the teacher roster and remaining member snapshot', async () => {
    const leader = createSession(db, 'student').sessionId;
    const groupResponse = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': leader }, body: JSON.stringify({ mode: 'leader', groupName: 'Return Team' }) });
    const group = await groupResponse.json() as { groupId: string; inviteCode: string };
    const member = createSession(db, 'student').sessionId;
    const memberResponse = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': member }, body: JSON.stringify({ mode: 'member', inviteCode: group.inviteCode }) });
    expect(memberResponse.status).toBe(201);

    const teacher = await subscribe(teacherId);
    expect(teacher.snapshot).toMatchObject({ type: 'activity.roster.updated', groups: expect.arrayContaining([expect.objectContaining({ groupId: group.groupId, leaderOnline: true })]) });
    const student = await subscribe(member);
    expect(student.snapshot).toMatchObject({ type: 'team.presence.updated', groupId: group.groupId, groupRole: 'member' });
    const teacherUpdate = harness.nextMessage(teacher.socket);
    const studentUpdate = harness.nextMessage(student.socket);
    const response = await fetch(`${baseUrl}/api/sessions/${leader}/reset-context`, { method: 'POST' });

    expect(response.status).toBe(200);
    expect(JSON.parse(await teacherUpdate)).toMatchObject({ type: 'activity.roster.updated', activityLiveRevision: 5,
      groups: expect.arrayContaining([expect.objectContaining({ groupId: group.groupId, onlineCount: 1, leaderOnline: true })]) });
    expect(JSON.parse(await studentUpdate)).toMatchObject({ type: 'team.presence.updated', groupId: group.groupId,
      groupLiveRevision: 3, groupRole: 'leader', onlineCount: 1 });
  });

  it('publishes a submitted answer only to its team and the activity teacher', async () => {
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const teacher = await subscribe(teacherId);
    const blue = await subscribe(blueStudentId);
    const green = await subscribe(greenStudentId);
    const teacherLegacyEvent = harness.nextMessage(teacher.socket);
    const teacherTeamEvent = harness.nextMessage(teacher.socket);
    const blueAnswerEvent = harness.nextMessage(blue.socket);
    const greenUnexpectedEvent = harness.nextMessage(green.socket, 250);

    const response = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': blueStudentId },
      body: JSON.stringify({ questionNumber: 2, answerParts: ['Blue submitted'] })
    });
    expect(response.status).toBe(201);
    expect(JSON.parse(await teacherLegacyEvent)).toMatchObject({ type: 'buzzer.question.updated', groupId: blueGroupId });
    expect(JSON.parse(await teacherTeamEvent)).toMatchObject({ type: 'activity.team-answer.updated', groupId: blueGroupId,
      questionNumber: 2, answerParts: ['Blue submitted'] });
    expect(JSON.parse(await blueAnswerEvent)).toMatchObject({ type: 'team.answer.updated', groupId: blueGroupId,
      questionNumber: 2, answerParts: ['Blue submitted'] });
    await expect(greenUnexpectedEvent).rejects.toThrow('WebSocket message was not received');
  });
});
