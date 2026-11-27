import { Router, type Request } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { enrollGroup } from '../application/group-service.js';
import { getTeacherGroupRoster } from '../application/group-roster-service.js';
import { HttpError, isRecord, requireNonEmptyString } from '../../../api/validation.js';
import type { ActivityLivePublishers } from '../realtime/websocket-server.js';

function sessionIdFrom(request: Request): string {
  const sessionId = request.header('X-Local-Session-Id');
  if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇本機使用者角色。');
  return sessionId;
}

export function groupRoutes(db: SqliteDatabase, livePublishers?: Pick<ActivityLivePublishers, 'publishTeamPresence' | 'publishRoster'>): Router {
  const router = Router();
  router.post('/api/activities/:activityId/groups', (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).some((key) => !['mode', 'groupName', 'inviteCode'].includes(key))) throw new HttpError(400, 'INVALID_ENROLLMENT', '加入組別資料格式不正確。');
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const group = enrollGroup(db, sessionIdFrom(request), activityId, request.body);
      livePublishers?.publishTeamPresence(activityId, group.groupId);
      livePublishers?.publishRoster(activityId);
      response.status(201).json(group);
    } catch (error) { next(error); }
  });
  router.get('/api/activities/:activityId/groups', (request, response, next) => {
    try {
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const sessionId = sessionIdFrom(request);
      response.json({ items: getTeacherGroupRoster(db, sessionId, activityId) });
    } catch (error) { next(error); }
  });
  return router;
}
