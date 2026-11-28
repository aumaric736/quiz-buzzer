import { Router } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { createSession, getSession, retireSession } from '../application/session-service.js';
import { HttpError, isRecord } from '../../../api/validation.js';
import { endActivitiesForTeacherLeave } from '../application/teacher-presence-service.js';
import type { ActivityPhaseUpdatedEvent } from '@quiz-buzzer/shared';
import type { ActivityLivePublishers } from '../realtime/websocket-server.js';

export function sessionRoutes(db: SqliteDatabase, publishPhase: (event: ActivityPhaseUpdatedEvent) => void = () => undefined,
  livePublishers?: Pick<ActivityLivePublishers, 'publishTeamPresence' | 'publishRoster'>): Router {
  const router = Router();

  router.post('/api/sessions', (request, response, next) => {
    try {
      if (!isRecord(request.body)) throw new HttpError(400, 'INVALID_ROLE', '請選擇老師或學生角色。');
      if (request.body.role === 'teacher') throw new HttpError(403, 'TEACHER_LOGIN_REQUIRED', '老師請使用帳號密碼登入。');
      response.status(201).json(createSession(db, request.body.role));
    } catch (error) { next(error); }
  });

  router.get('/api/sessions/:sessionId', (request, response, next) => {
    try {
      const sessionId = request.params.sessionId;
      if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'INVALID_SESSION_ID', '工作階段識別格式不正確。');
      response.json(getSession(db, sessionId));
    } catch (error) { next(error); }
  });

  router.post('/api/sessions/:sessionId/reset-context', async (request, response, next) => {
    try {
      const sessionId = request.params.sessionId;
      if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'INVALID_SESSION_ID', '工作階段識別格式不正確。');
      const role = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
      const currentContext = db.prepare('SELECT activity_id AS activityId, group_id AS groupId FROM user_sessions WHERE id = ?').get(sessionId) as
        { activityId: string | null; groupId: string | null } | undefined;
      if (role?.role === 'teacher') {
        const activities = db.prepare("SELECT id, phase, revision FROM activities WHERE created_by_session_id = ? AND phase != '已結束'").all(sessionId) as Array<{ id: string; phase: string; revision: number }>;
        await endActivitiesForTeacherLeave(db, sessionId);
        activities.forEach((activity) => publishPhase({ type: 'activity.phase.updated', activityId: activity.id, phase: '已結束', revision: activity.revision + 1 }));
      }
      const result = retireSession(db, sessionId);
      if (currentContext?.activityId && currentContext.groupId) {
        livePublishers?.publishTeamPresence(currentContext.activityId, currentContext.groupId);
        livePublishers?.publishRoster(currentContext.activityId);
      }
      response.json(result);
    } catch (error) { next(error); }
  });

  return router;
}
