import { Router } from 'express';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { loadEndedAnswerResults } from '../application/winning-answer-provider.js';
import { HttpError, requireNonEmptyString } from '../../../api/validation.js';

export function finalResultsRoutes(db: SqliteDatabase): Router {
  const router = Router();
  router.get('/api/activities/:activityCode/final-results', (request, response, next) => {
    try {
      const activityId = requireNonEmptyString(request.params.activityCode, 'activityCode', 100);
      const activity = db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId) as { phase: string } | undefined;
      if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動，請確認活動加入碼。');
      if (activity.phase !== '已結束') throw new HttpError(409, 'RESULTS_NOT_PUBLISHED', '活動結束後才能瀏覽最終結果。');
      const questions = db.prepare('SELECT count(*) AS total FROM activity_questions WHERE activity_id = ?').get(activityId) as { total: number };
      response.json({ phase: '已結束', items: questions.total ? loadEndedAnswerResults(db, activityId) : [] });
    } catch (error) { next(error); }
  });
  return router;
}
