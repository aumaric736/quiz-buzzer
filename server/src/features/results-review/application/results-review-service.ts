import type { TeacherActivityListResponse, TeacherReviewRecordsResponse } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { listOwnedActivities, loadReviewRecords } from '../persistence/results-review-repository.js';
import { requireActiveSession } from '../../user-stage-sync/application/session-service.js';

function requireTeacherSession(db: SqliteDatabase, sessionId: string): void {
  requireActiveSession(db, sessionId);
  const session = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  if (session.role !== 'teacher') throw new HttpError(403, 'TEACHER_REQUIRED', '只有老師可以查看活動歷史與檢討紀錄。');
}

export function getTeacherActivities(db: SqliteDatabase, sessionId: string): TeacherActivityListResponse {
  requireTeacherSession(db, sessionId);
  return listOwnedActivities(db, sessionId);
}

export function getTeacherReviewRecords(db: SqliteDatabase, sessionId: string, activityId: string): TeacherReviewRecordsResponse {
  requireActiveSession(db, sessionId);
  const session = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  const activity = db.prepare(`SELECT phase, created_by_session_id AS owner
    FROM activities WHERE id = ?`).get(activityId) as { phase: string; owner: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (session.role !== 'teacher' || activity.owner !== sessionId) {
    throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有建立此活動的老師可以查看完整作答紀錄。');
  }
  if (activity.phase !== '已結束') throw new HttpError(409, 'BUZZER_NOT_ENDED', '活動結束後才能讀取完整作答紀錄。');
  return loadReviewRecords(db, activityId);
}
