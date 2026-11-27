import { Router } from 'express';
import type { SqliteDatabase } from '../persistence/database.js';
import { authenticateTeacher, type TeacherCredentials } from '../application/teacher-auth-service.js';
import { HttpError, isRecord } from '../../../api/validation.js';

export function teacherRoutes(db: SqliteDatabase, credentials: TeacherCredentials | null): Router {
  const router = Router();
  router.post('/api/teacher/login', (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 2 || !('username' in request.body) || !('password' in request.body)) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤。');
      }
      response.json(authenticateTeacher(db, credentials, request.body));
    } catch (error) { next(error); }
  });
  return router;
}
