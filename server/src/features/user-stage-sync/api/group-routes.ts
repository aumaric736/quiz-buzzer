import { Router, type Request } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { enrollGroup } from '../application/group-service.js';
import { HttpError, isRecord, requireNonEmptyString } from '../../../api/validation.js';

function sessionIdFrom(request: Request): string {
  const sessionId = request.header('X-Local-Session-Id');
  if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇本機使用者角色。');
  return sessionId;
}

export function groupRoutes(db: SqliteDatabase): Router {
  const router = Router();
  router.post('/api/activities/:activityId/groups', (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 1 || !('groupName' in request.body)) throw new HttpError(400, 'INVALID_GROUP_NAME', '請輸入組別名稱。');
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      response.status(201).json(enrollGroup(db, sessionIdFrom(request), activityId, request.body.groupName));
    } catch (error) { next(error); }
  });
  return router;
}
