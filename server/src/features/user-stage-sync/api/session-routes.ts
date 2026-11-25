import { Router } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { createSession, getSession, retireSession } from '../application/session-service.js';
import { HttpError, isRecord } from '../../../api/validation.js';

export function sessionRoutes(db: SqliteDatabase): Router {
  const router = Router();

  router.post('/api/sessions', (request, response, next) => {
    try {
      if (!isRecord(request.body)) throw new HttpError(400, 'INVALID_ROLE', '請選擇老師或學生角色。');
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

  router.post('/api/sessions/:sessionId/reset-context', (request, response, next) => {
    try {
      const sessionId = request.params.sessionId;
      if (!sessionId || sessionId.length > 100) throw new HttpError(400, 'INVALID_SESSION_ID', '工作階段識別格式不正確。');
      response.json(retireSession(db, sessionId));
    } catch (error) { next(error); }
  });

  return router;
}
