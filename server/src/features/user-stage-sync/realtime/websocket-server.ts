import type {
  ActivityPhase, ActivityPhaseUpdatedEvent, ActivityRosterUpdatedEvent, ActivityTeamAnswerUpdatedEvent,
  BuzzerQuestionUpdatedEvent, LiveGroupRosterRecord, LiveQuestionAnswerSnapshot, Role, TeamAnswerUpdatedEvent,
  TeamPresenceUpdatedEvent
} from '@quiz-buzzer/shared';
import type { WebSocket, WebSocketServer } from 'ws';
import type { SqliteDatabase } from '../persistence/database.js';
import { markStudentDisconnected, restoreStudentPresence } from '../application/student-session-presence-service.js';
import { markTeacherDisconnected, restoreTeacherPresence } from '../application/teacher-presence-service.js';

interface Subscription { activityId: string; sessionId: string }

export interface ActivityLivePublishers {
  publishRoster(activityId: string): void;
  publishTeamPresence(activityId: string, groupId: string): void;
  publishTeamAnswer(activityId: string, groupId: string, questionNumber: number): void;
}

function sendError(socket: WebSocket, code: string, message: string): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'error', code, message }));
}

function isSubscription(value: unknown): value is { type: 'activity.subscribe'; activityId: string; sessionId: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate).length === 3 && candidate.type === 'activity.subscribe'
    && typeof candidate.activityId === 'string' && candidate.activityId.length > 0
    && typeof candidate.sessionId === 'string' && candidate.sessionId.length > 0;
}

export function attachActivitySubscriptions(wss: WebSocketServer, db: SqliteDatabase): {
  publishPhase: (event: ActivityPhaseUpdatedEvent) => void;
  publishBuzzerQuestion: (event: BuzzerQuestionUpdatedEvent) => void;
} & ActivityLivePublishers {
  const subscriptions = new Map<WebSocket, Subscription>();

  function listAnswers(activityId: string, groupId: string): LiveQuestionAnswerSnapshot[] {
    const rows = db.prepare(`SELECT q.question_number AS questionNumber, b.answer_parts_json AS answerPartsJson
      FROM activity_questions q
      LEFT JOIN buzzer_submissions b ON b.activity_id = q.activity_id
        AND b.question_number = q.question_number AND b.group_id = ?
      WHERE q.activity_id = ? ORDER BY q.question_number`).all(groupId, activityId) as
      Array<{ questionNumber: number; answerPartsJson: string | null }>;
    return rows.map((row) => row.answerPartsJson === null
      ? { questionNumber: row.questionNumber, status: 'unanswered' }
      : { questionNumber: row.questionNumber, status: 'submitted', answerParts: JSON.parse(row.answerPartsJson) as string[] });
  }

  function listRosterGroups(activityId: string): LiveGroupRosterRecord[] {
    const rows = db.prepare(`SELECT g.id AS groupId, g.display_name AS displayName, g.invite_code AS inviteCode,
        g.accepts_members AS acceptsMembers,
        (SELECT count(*) FROM user_sessions s WHERE s.group_id = g.id AND s.role = 'student'
          AND s.retired_at IS NULL AND s.disconnected_until IS NULL) AS onlineCount,
        (SELECT count(*) FROM user_sessions s WHERE s.group_id = g.id AND s.role = 'student' AND s.retired_at IS NULL) AS occupiedCount
      FROM groups g WHERE g.activity_id = ? ORDER BY g.joined_at, g.id`).all(activityId) as Array<{
        groupId: string; displayName: string; inviteCode: string; acceptsMembers: number; onlineCount: number; occupiedCount: number
      }>;
    return rows.map((row) => ({ groupId: row.groupId, displayName: row.displayName, inviteCode: row.inviteCode,
      onlineCount: row.onlineCount, occupiedCount: row.occupiedCount, capacity: 2, acceptsMembers: row.acceptsMembers === 1,
      answers: listAnswers(activityId, row.groupId) }));
  }

  function buildRosterEvent(activityId: string): ActivityRosterUpdatedEvent | null {
    const activity = db.prepare('SELECT live_revision AS liveRevision FROM activities WHERE id = ?').get(activityId) as
      { liveRevision: number } | undefined;
    return activity ? { type: 'activity.roster.updated', activityId, activityLiveRevision: activity.liveRevision,
      groups: listRosterGroups(activityId) } : null;
  }

  function buildTeamPresenceEvent(activityId: string, groupId: string, sessionId: string): TeamPresenceUpdatedEvent | null {
    const row = db.prepare(`SELECT g.id AS groupId, g.display_name AS displayName, g.accepts_members AS acceptsMembers,
        g.live_revision AS liveRevision, s.group_role AS groupRole,
        (SELECT count(*) FROM user_sessions online WHERE online.group_id = g.id AND online.role = 'student'
          AND online.retired_at IS NULL AND online.disconnected_until IS NULL) AS onlineCount,
        (SELECT count(*) FROM user_sessions occupied WHERE occupied.group_id = g.id AND occupied.role = 'student'
          AND occupied.retired_at IS NULL) AS occupiedCount
      FROM groups g JOIN user_sessions s ON s.group_id = g.id
      WHERE g.id = ? AND g.activity_id = ? AND s.id = ? AND s.role = 'student' AND s.retired_at IS NULL`)
      .get(groupId, activityId, sessionId) as { groupId: string; displayName: string; acceptsMembers: number; liveRevision: number;
        groupRole: 'leader' | 'member'; onlineCount: number; occupiedCount: number } | undefined;
    if (!row) return null;
    return { type: 'team.presence.updated', activityId, groupId: row.groupId, groupLiveRevision: row.liveRevision,
      displayName: row.displayName, groupRole: row.groupRole, onlineCount: row.onlineCount, occupiedCount: row.occupiedCount,
      capacity: 2, acceptsMembers: row.acceptsMembers === 1, answers: listAnswers(activityId, groupId) };
  }

  function sendToTeacher(activityId: string, message: ActivityRosterUpdatedEvent | ActivityTeamAnswerUpdatedEvent): void {
    const activity = db.prepare('SELECT created_by_session_id AS owner FROM activities WHERE id = ?').get(activityId) as
      { owner: string } | undefined;
    if (!activity) return;
    const encoded = JSON.stringify(message);
    for (const [socket, subscription] of subscriptions) {
      if (subscription.activityId !== activityId || subscription.sessionId !== activity.owner || socket.readyState !== socket.OPEN) continue;
      const session = db.prepare('SELECT role, retired_at, authenticated_at FROM user_sessions WHERE id = ?').get(subscription.sessionId) as
        { role: Role; retired_at: string | null; authenticated_at: string | null } | undefined;
      if (session?.role !== 'teacher' || session.retired_at || !session.authenticated_at) { subscriptions.delete(socket); continue; }
      try { socket.send(encoded); } catch { subscriptions.delete(socket); }
    }
  }

  function sendToTeam(activityId: string, groupId: string,
    build: (sessionId: string) => TeamPresenceUpdatedEvent | TeamAnswerUpdatedEvent | null): void {
    for (const [socket, subscription] of subscriptions) {
      if (subscription.activityId !== activityId || socket.readyState !== socket.OPEN) continue;
      const session = db.prepare('SELECT role, group_id AS groupId, retired_at FROM user_sessions WHERE id = ?').get(subscription.sessionId) as
        { role: Role; groupId: string | null; retired_at: string | null } | undefined;
      if (session?.role !== 'student' || session.retired_at || session.groupId !== groupId) continue;
      const event = build(subscription.sessionId);
      if (!event) continue;
      try { socket.send(JSON.stringify(event)); } catch { subscriptions.delete(socket); }
    }
  }

  const publishRoster = (activityId: string) => {
    const event = buildRosterEvent(activityId);
    if (event) sendToTeacher(activityId, event);
  };

  const publishTeamPresence = (activityId: string, groupId: string) => {
    sendToTeam(activityId, groupId, (sessionId) => buildTeamPresenceEvent(activityId, groupId, sessionId));
  };

  const publishTeamAnswer = (activityId: string, groupId: string, questionNumber: number) => {
    const submission = db.prepare(`SELECT b.answer_parts_json AS answerPartsJson, g.display_name AS groupName,
        g.live_revision AS groupLiveRevision, a.live_revision AS activityLiveRevision
      FROM buzzer_submissions b JOIN groups g ON g.id = b.group_id JOIN activities a ON a.id = b.activity_id
      WHERE b.activity_id = ? AND b.group_id = ? AND b.question_number = ?`)
      .get(activityId, groupId, questionNumber) as { answerPartsJson: string; groupName: string; groupLiveRevision: number;
        activityLiveRevision: number } | undefined;
    if (!submission) return;
    const answerParts = JSON.parse(submission.answerPartsJson) as string[];
    const teamEvent: TeamAnswerUpdatedEvent = { type: 'team.answer.updated', activityId, groupId,
      groupLiveRevision: submission.groupLiveRevision, questionNumber, status: 'submitted', answerParts };
    const teacherEvent: ActivityTeamAnswerUpdatedEvent = { type: 'activity.team-answer.updated', activityId,
      activityLiveRevision: submission.activityLiveRevision, groupId, groupName: submission.groupName,
      questionNumber, status: 'submitted', answerParts };
    sendToTeam(activityId, groupId, () => teamEvent);
    sendToTeacher(activityId, teacherEvent);
  };

  wss.on('connection', (socket) => {
    socket.on('message', async (data) => {
      let payload: unknown;
      try { payload = JSON.parse(data.toString()); }
      catch { sendError(socket, 'INVALID_MESSAGE', 'WebSocket 訊息格式無效。'); return; }
      if (!isSubscription(payload)) { sendError(socket, 'INVALID_MESSAGE', '僅接受有效的活動訂閱訊息。'); return; }

      const candidate = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(payload.sessionId) as { role: Role } | undefined;
      if (candidate?.role === 'student' && !restoreStudentPresence(db, payload.sessionId)) {
        sendError(socket, 'SUBSCRIPTION_DENIED', '學生工作階段已逾時，請使用活動碼與小組邀請碼重新加入。'); return;
      }
      if (candidate?.role === 'teacher') await restoreTeacherPresence(db, payload.sessionId);

      const session = db.prepare('SELECT role, activity_id, group_id, retired_at, authenticated_at FROM user_sessions WHERE id = ?').get(payload.sessionId) as
        { role: Role; activity_id: string | null; group_id: string | null; retired_at: string | null; authenticated_at: string | null } | undefined;
      const activity = db.prepare('SELECT id, phase, revision, created_by_session_id FROM activities WHERE id = ?').get(payload.activityId) as
        { id: string; phase: ActivityPhase; revision: number; created_by_session_id: string } | undefined;
      if (!session || session.retired_at || !activity) { sendError(socket, 'SUBSCRIPTION_DENIED', '找不到工作階段或活動，請重新整理畫面。'); return; }
      const isActivityOwner = session.role === 'teacher' && session.authenticated_at !== null && activity.created_by_session_id === payload.sessionId;
      const isJoinedStudent = session.role === 'student' && session.activity_id === payload.activityId
        && session.group_id !== null
        && Boolean(db.prepare('SELECT 1 FROM groups WHERE id = ? AND activity_id = ?').get(session.group_id, payload.activityId));
      const authorized = isActivityOwner || isJoinedStudent;
      if (!authorized) { sendError(socket, 'SUBSCRIPTION_DENIED', '此工作階段尚未加入或無權訂閱此活動。'); return; }

      subscriptions.set(socket, { activityId: payload.activityId, sessionId: payload.sessionId });
      socket.send(JSON.stringify({ type: 'activity.subscribed', activityId: activity.id, phase: activity.phase, revision: activity.revision }));
      if (isActivityOwner) {
        const snapshot = buildRosterEvent(activity.id);
        if (snapshot) socket.send(JSON.stringify(snapshot));
      } else if (isJoinedStudent) {
        const snapshot = buildTeamPresenceEvent(activity.id, session.group_id!, payload.sessionId);
        if (snapshot) socket.send(JSON.stringify(snapshot));
      }
    });
    const detach = () => {
      const subscription = subscriptions.get(socket);
      subscriptions.delete(socket);
      if (!subscription) return;
      const stillConnected = [...subscriptions.values()].some((item) => item.sessionId === subscription.sessionId);
      if (!stillConnected) {
        if (!db.open) return;
        const row = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(subscription.sessionId) as { role: Role } | undefined;
        if (row?.role === 'student') markStudentDisconnected(db, subscription.sessionId);
        else if (row?.role === 'teacher') markTeacherDisconnected(db, subscription.sessionId);
      }
    };
    socket.on('close', detach);
    socket.on('error', detach);
  });

  const publishPhase = (event: ActivityPhaseUpdatedEvent) => {
    const encoded = JSON.stringify(event);
    for (const [socket, subscription] of subscriptions) {
      if (subscription.activityId === event.activityId && socket.readyState === socket.OPEN) {
        const session = db.prepare('SELECT retired_at FROM user_sessions WHERE id = ?').get(subscription.sessionId) as { retired_at: string | null } | undefined;
        if (!session || session.retired_at) { subscriptions.delete(socket); continue; }
        try { socket.send(encoded); }
        catch { subscriptions.delete(socket); }
      }
    }
  };

  const publishBuzzerQuestion = (event: BuzzerQuestionUpdatedEvent) => {
    const activity = db.prepare('SELECT created_by_session_id AS owner FROM activities WHERE id = ?').get(event.activityId) as { owner: string } | undefined;
    if (!activity) return;
    const encoded = JSON.stringify(event);
    for (const [socket, subscription] of subscriptions) {
      if (subscription.activityId !== event.activityId || subscription.sessionId !== activity.owner || socket.readyState !== socket.OPEN) continue;
      const session = db.prepare('SELECT role, retired_at, authenticated_at FROM user_sessions WHERE id = ?').get(subscription.sessionId) as { role: Role; retired_at: string | null; authenticated_at: string | null } | undefined;
      if (session?.role !== 'teacher' || session.retired_at || !session.authenticated_at) { subscriptions.delete(socket); continue; }
      try { socket.send(encoded); } catch { subscriptions.delete(socket); }
    }
  };

  return { publishPhase, publishBuzzerQuestion, publishRoster, publishTeamPresence, publishTeamAnswer };
}
