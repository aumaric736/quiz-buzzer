import { Router, type Request } from 'express';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { HttpError, requireNonEmptyString } from '../../../api/validation.js';
import { getTeacherActivities, getTeacherReviewRecords } from '../application/results-review-service.js';

function sessionFrom(request: Request): string {
  const sessionId = request.header('X-Local-Session-Id');
  if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇本機使用者角色。');
  return sessionId;
}

export function resultsReviewRoutes(db: SqliteDatabase): Router {
  const router = Router();
  router.get('/api/teacher/activities', (request, response, next) => {
    try { response.json(getTeacherActivities(db, sessionFrom(request))); }
    catch (error) { next(error); }
  });
  router.get('/api/activities/:activityId/review-records', (request, response, next) => {
    try {
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      response.json(getTeacherReviewRecords(db, sessionFrom(request), activityId));
    } catch (error) { next(error); }
  });
  return router;
}
