import { Router, type Request } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { createActivity, getActivity, transitionActivity } from '../application/activity-service.js';
import { HttpError, isRecord, requireNonEmptyString } from '../../../api/validation.js';
import type { ActivityPhaseUpdatedEvent } from '@quiz-buzzer/shared';
import { activityOperationQueue } from '../../buzzer-flow/application/activity-operation-queue.js';
import { recordActivityOperation } from '../../buzzer-flow/persistence/activity-operation-repository.js';

type PhasePublisher = (event: ActivityPhaseUpdatedEvent) => void;

function requestSessionId(request: Request): string {
  const value = request.header('X-Local-Session-Id');
  if (!value || value.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇本機使用者角色。');
  return value;
}

export function activityRoutes(db: SqliteDatabase, publishPhase: PhasePublisher = () => undefined): Router {
  const router = Router();
  router.post('/api/activities', (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 0) throw new HttpError(400, 'INVALID_REQUEST_BODY', '建立活動不需要額外欄位。');
      response.status(201).json(createActivity(db, requestSessionId(request)));
    } catch (error) { next(error); }
  });
  router.get('/api/activities/:activityId', (request, response, next) => {
    try {
      const sessionId = requestSessionId(request);
      const session = db.prepare('SELECT id, retired_at FROM user_sessions WHERE id = ?').get(sessionId) as { id: string; retired_at: string | null } | undefined;
      if (!session || session.retired_at) {
        throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
      }
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      response.json(getActivity(db, activityId));
    } catch (error) { next(error); }
  });
  router.post('/api/activities/:activityId/phase', async (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 1 || !('phase' in request.body)) throw new HttpError(409, 'INVALID_PHASE_TRANSITION', '請提供有效的下一個活動階段。');
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const sessionId = requestSessionId(request);
      const snapshot = request.body.phase === '已結束'
        ? await activityOperationQueue.run(activityId, () => {
          recordActivityOperation(db, activityId, 'end');
          return transitionActivity(db, sessionId, activityId, request.body.phase);
        })
        : transitionActivity(db, sessionId, activityId, request.body.phase);
      publishPhase({ type: 'activity.phase.updated', ...snapshot });
      response.json(snapshot);
    } catch (error) { next(error); }
  });
  return router;
}
