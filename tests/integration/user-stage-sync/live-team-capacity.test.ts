import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActivityRosterUpdatedEvent, ActivityTeamAnswerUpdatedEvent, LiveGroupRosterRecord, StudentOwnQuestionStatus, TeamAnswerUpdatedEvent, TeamPresenceUpdatedEvent } from '@quiz-buzzer/shared';
import { createHttpServer } from '../../../server/src/app.js';
import { createActivity, openActivityJoining, transitionActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { enrollGroupForTest as enrollGroup } from '../../helpers/sqlite.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { GroupPresenceStatus } from '../../../client/src/features/user-stage-sync/components/GroupPresenceStatus.js';
import { TeacherGroupRoster } from '../../../client/src/features/user-stage-sync/components/TeacherGroupRoster.js';
import { AnswerQuestionForm } from '../../../client/src/features/buzzer-flow/components/AnswerQuestionForm.js';
import { applyStudentAnswerEvent, applyStudentPresenceEvent, applyTeacherLiveEvent } from '../../../client/src/features/user-stage-sync/services/live-activity-state.js';
import { createLiveTeamTestHarness, type LiveTeamTestHarness } from '../../helpers/live-team-activity.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

const config = { host: '127.0.0.1' as const, port: 0, clientOrigin: 'http://127.0.0.1:5173', databasePath: ':memory:' };

describe('live team activity capacity', () => {
  let db: SqliteDatabase;
  let server: Server;
  let harness: LiveTeamTestHarness;
  let activityId: string;
  let teacherId: string;
  let baseUrl: string;
  let wsUrl: string;

  beforeEach(async () => {
    db = createTestDatabase(); harness = createLiveTeamTestHarness();
    teacherId = createSession(db, 'teacher').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    seedGuidedNotesQuestions(db, activityId, [1]);
    openActivityJoining(db, teacherId, activityId);
    const created = createHttpServer(db, config); server = created.server;
    server.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${port}`; wsUrl = `ws://127.0.0.1:${port}/ws`;
  });

  afterEach(async () => {
    await harness.closeSockets();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  it('applies committed create/join/presence/expiry/answer events through view state and renders each authorized screen within two seconds at capacity', async () => {
    const teams: Array<{ groupId: string; inviteCode: string; members: string[] }> = [];
    for (let index = 0; index < 99; index++) {
      const leader = createSession(db, 'student').sessionId;
      const group = enrollGroup(db, leader, activityId, { mode: 'leader', groupName: `Team ${index}` });
      const member = createSession(db, 'student').sessionId;
      enrollGroup(db, member, activityId, { mode: 'member', inviteCode: group.inviteCode });
      teams.push({ groupId: group.groupId, inviteCode: group.inviteCode, members: [leader, member] });
    }

    const sockets = new Map<string, import('ws').WebSocket>();
    async function subscribe(sessionId: string): Promise<Record<string, unknown>> {
      const socket = await harness.connect(wsUrl);
      const ack = harness.nextMessage(socket);
      socket.send(JSON.stringify({ type: 'activity.subscribe', activityId, sessionId }));
      expect(JSON.parse(await ack)).toMatchObject({ type: 'activity.subscribed', activityId });
      const snapshot = JSON.parse(await harness.nextMessage(socket)) as Record<string, unknown>;
      sockets.set(sessionId, socket);
      return snapshot;
    }
    const initialTeacherSnapshot = await subscribe(teacherId) as unknown as ActivityRosterUpdatedEvent;
    expect(initialTeacherSnapshot.groups).toHaveLength(99);
    let teacherGroups: LiveGroupRosterRecord[] | null = applyTeacherLiveEvent(null, initialTeacherSnapshot);
    const studentStates = new Map<string, { presence: TeamPresenceUpdatedEvent; answers: StudentOwnQuestionStatus[] }>();
    for (const team of teams) for (const sessionId of team.members) {
      const snapshot = await subscribe(sessionId) as unknown as TeamPresenceUpdatedEvent;
      studentStates.set(sessionId, { presence: applyStudentPresenceEvent(snapshot), answers: applyStudentAnswerEvent(null, snapshot) });
    }

    function renderTeacher(): string {
      return renderToStaticMarkup(createElement(TeacherGroupRoster, { sessionId: teacherId, activityId, liveGroups: teacherGroups }));
    }
    function renderPresence(sessionId: string): string {
      return renderToStaticMarkup(createElement(GroupPresenceStatus, { snapshot: studentStates.get(sessionId)!.presence }));
    }
    function renderAnswer(sessionId: string): string {
      const answers = studentStates.get(sessionId)!.answers;
      return renderToStaticMarkup(createElement(AnswerQuestionForm, { sessionId, activityId, groupId: teams[0].groupId,
        phase: '搶答進行中', question: { questionNumber: 1, blankCount: 1 },
        alreadySubmitted: answers.some((item) => item.questionNumber === 1), submittedAnswerParts: answers.find((item) => item.questionNumber === 1)?.answerParts }));
    }
    async function receiveTeacherRoster(startedAt: number): Promise<string> {
      const event = JSON.parse(await harness.nextMessage(sockets.get(teacherId)!)) as ActivityRosterUpdatedEvent;
      expect(event.type).toBe('activity.roster.updated');
      teacherGroups = applyTeacherLiveEvent(teacherGroups, event);
      const markup = renderTeacher();
      expect(performance.now() - startedAt).toBeLessThan(2000);
      return markup;
    }

    // Commit a real group creation at 99 groups / 198 sessions, then render the teacher's event-derived state.
    const newLeaderId = createSession(db, 'student').sessionId;
    const createEventAt = performance.now();
    const createResponse = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': newLeaderId },
      body: JSON.stringify({ mode: 'leader', groupName: 'Team 99' })
    });
    expect(createResponse.status).toBe(201);
    const newGroup = await createResponse.json() as { groupId: string; inviteCode: string };
    let teacherMarkup = await receiveTeacherRoster(createEventAt);
    expect(teacherMarkup).toContain('Team 99');
    expect(teacherMarkup).toContain('100/100 組');
    const leaderPresenceSnapshot = await subscribe(newLeaderId) as unknown as TeamPresenceUpdatedEvent;
    studentStates.set(newLeaderId, { presence: leaderPresenceSnapshot, answers: applyStudentAnswerEvent(null, leaderPresenceSnapshot) });

    // Commit the 200th student enrollment; assert both teacher roster and leader presence state came from live events.
    const newMemberId = createSession(db, 'student').sessionId;
    const leaderPresenceEvent = harness.nextMessage(sockets.get(newLeaderId)!);
    const joinEventAt = performance.now();
    const joinResponse = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': newMemberId },
      body: JSON.stringify({ mode: 'member', inviteCode: newGroup.inviteCode })
    });
    expect(joinResponse.status).toBe(201);
    const memberRecord = await joinResponse.json() as { groupId: string };
    expect(memberRecord.groupId).toBe(newGroup.groupId);
    teacherMarkup = await receiveTeacherRoster(joinEventAt);
    expect(teacherGroups!.find((group) => group.groupId === newGroup.groupId)).toMatchObject({ onlineCount: 2, joinStatus: '額滿' });
    const joinedPresence = JSON.parse(await leaderPresenceEvent) as TeamPresenceUpdatedEvent;
    const leaderState = studentStates.get(newLeaderId)!;
    studentStates.set(newLeaderId, { presence: applyStudentPresenceEvent(joinedPresence), answers: applyStudentAnswerEvent(leaderState.answers, joinedPresence) });
    const memberPresence = await subscribe(newMemberId) as unknown as TeamPresenceUpdatedEvent;
    studentStates.set(newMemberId, { presence: memberPresence, answers: applyStudentAnswerEvent(null, memberPresence) });
    expect(teacherMarkup).toContain('2 人在線');
    expect(renderPresence(newLeaderId)).toContain('組長');
    expect(renderPresence(newLeaderId)).toContain('2/2（已滿額）');
    expect(renderPresence(newMemberId)).toContain('組員');

    // A clean WebSocket close immediately publishes the lower online count while retaining membership.
    const leaderPresenceOnDisconnect = harness.nextMessage(sockets.get(newLeaderId)!);
    const teacherOnDisconnect = harness.nextMessage(sockets.get(teacherId)!);
    const disconnectAt = performance.now();
    sockets.get(newMemberId)!.close(1000);
    const [disconnectPresence, disconnectRoster] = await Promise.all([leaderPresenceOnDisconnect, teacherOnDisconnect]);
    const offlinePresence = JSON.parse(disconnectPresence) as TeamPresenceUpdatedEvent;
    const disconnectedRoster = JSON.parse(disconnectRoster) as ActivityRosterUpdatedEvent;
    const leaderBeforeDisconnect = studentStates.get(newLeaderId)!;
    studentStates.set(newLeaderId, { presence: applyStudentPresenceEvent(offlinePresence), answers: applyStudentAnswerEvent(leaderBeforeDisconnect.answers, offlinePresence) });
    teacherGroups = applyTeacherLiveEvent(teacherGroups, disconnectedRoster);
    teacherMarkup = renderTeacher();
    expect(renderPresence(newLeaderId)).toContain('1/2');
    expect(teacherGroups!.find((group) => group.groupId === newGroup.groupId)).toMatchObject({ onlineCount: 1, joinStatus: '開放加入' });
    expect(teacherMarkup).toContain('1 人在線');
    expect(performance.now() - disconnectAt).toBeLessThan(2000);

    expect(db.prepare('SELECT group_id AS groupId, retired_at AS retiredAt, disconnected_at AS disconnectedAt FROM user_sessions WHERE id = ?').get(newMemberId))
      .toMatchObject({ groupId: newGroup.groupId, retiredAt: null, disconnectedAt: expect.any(String) });
    expect(db.prepare("SELECT count(*) AS occupied FROM user_sessions WHERE group_id = ? AND role = 'student' AND retired_at IS NULL").get(newGroup.groupId))
      .toEqual({ occupied: 2 });

    // A winning answer is sent to teacher and both active views in Team 0; each screen renders reducer-derived state.
    transitionActivity(db, teacherId, activityId, '搶答進行中');
    const phaseRoster = await fetch(`${baseUrl}/api/activities/${activityId}/groups`, { headers: { 'X-Local-Session-Id': teacherId } });
    const phaseGroups = await phaseRoster.json() as { items: Array<{ groupId: string; joinStatus: LiveGroupRosterRecord['joinStatus']; onlineCount: number }> };
    teacherGroups = teacherGroups!.map((group) => {
      const updated = phaseGroups.items.find((item) => item.groupId === group.groupId);
      return updated ? { ...group, joinStatus: updated.joinStatus, onlineCount: updated.onlineCount } : group;
    });
    expect(teacherGroups!.every((group) => group.joinStatus === '停止加入')).toBe(true);
    const answerLeaderId = teams[0].members[0];
    const answerMemberId = teams[0].members[1];
    const legacyTeacherMessage = harness.nextMessage(sockets.get(teacherId)!);
    const teacherAnswerMessage = harness.nextMessage(sockets.get(teacherId)!);
    const leaderAnswerMessage = harness.nextMessage(sockets.get(answerLeaderId)!);
    const memberAnswerMessage = harness.nextMessage(sockets.get(answerMemberId)!);
    const answerCommitAt = performance.now();
    const answerResponse = await fetch(`${baseUrl}/api/activities/${activityId}/answers`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': answerMemberId },
      body: JSON.stringify({ questionNumber: 1, answerParts: ['capacity answer'] })
    });
    expect(answerResponse.status).toBe(201);
    expect(JSON.parse(await legacyTeacherMessage)).toMatchObject({ type: 'buzzer.question.updated', groupId: teams[0].groupId });
    const [teacherEvent, leaderEvent, memberEvent] = await Promise.all([teacherAnswerMessage, leaderAnswerMessage, memberAnswerMessage]);
    const activityAnswer = JSON.parse(teacherEvent) as ActivityTeamAnswerUpdatedEvent;
    teacherGroups = applyTeacherLiveEvent(teacherGroups, activityAnswer);
    for (const [sessionId, raw] of [[answerLeaderId, leaderEvent], [answerMemberId, memberEvent]] as const) {
      const event = JSON.parse(raw) as TeamAnswerUpdatedEvent;
      const state = studentStates.get(sessionId)!;
      studentStates.set(sessionId, { ...state, answers: applyStudentAnswerEvent(state.answers, event) });
    }
    teacherMarkup = renderTeacher();
    expect(teacherMarkup).toContain('第 1 題：capacity answer');
    expect(renderAnswer(answerLeaderId)).toContain('本組已提交：capacity answer');
    expect(renderAnswer(answerMemberId)).toContain('本組已提交：capacity answer');
    expect(performance.now() - answerCommitAt).toBeLessThan(2000);
  }, 60_000);
});
