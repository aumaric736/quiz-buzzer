import type { ActivityPhaseUpdatedEvent, ActivityPhase, BuzzerQuestionUpdatedEvent, Role } from '@quiz-buzzer/shared';
import type { WebSocket, WebSocketServer } from 'ws';
import type { SqliteDatabase } from '../persistence/database.js';
import { markStudentDisconnected, restoreStudentPresence } from '../application/student-session-presence-service.js';
import { markTeacherDisconnected, restoreTeacherPresence } from '../application/teacher-presence-service.js';

interface Subscription { activityId: string; sessionId: string }

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
} {
  const subscriptions = new Map<WebSocket, Subscription>();
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

  return { publishPhase, publishBuzzerQuestion };
}
