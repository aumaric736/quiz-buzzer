import { Router, type Request } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { readAnswerStatus } from '../application/answer-status-access.js';
import { HttpError, requireNonEmptyString } from '../../../api/validation.js';

function sessionFrom(request: Request): string {
  const sessionId = request.header('X-Local-Session-Id');
  if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇本機使用者角色。');
  return sessionId;
}

export function answerStatusRoutes(db: SqliteDatabase): Router {
  const router = Router();
  router.get('/api/activities/:activityId/answer-status', (request, response, next) => {
    try {
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      response.json(readAnswerStatus(db, sessionFrom(request), activityId));
    } catch (error) { next(error); }
  });
  return router;
}
