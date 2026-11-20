import { Router, type Request } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { checkAnswerAttempt } from '../application/answer-phase-guard.js';
import { HttpError, isRecord, requireNonEmptyString } from '../../../api/validation.js';

function sessionFrom(request: Request): string {
  const sessionId = request.header('X-Local-Session-Id');
  if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇本機使用者角色。');
  return sessionId;
}

export function answerAttemptCheckRoutes(db: SqliteDatabase): Router {
  const router = Router();
  router.post('/api/activities/:activityId/answer-attempt-check', (request, response, next) => {
    try {
      if (request.body !== undefined && (!isRecord(request.body) || Object.keys(request.body).length > 0)) {
        throw new HttpError(400, 'ANSWER_CONTENT_NOT_ALLOWED', '此檢查不接受答案內容。');
      }
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      response.json(checkAnswerAttempt(db, sessionFrom(request), activityId));
    } catch (error) { next(error); }
  });
  return router;
}
