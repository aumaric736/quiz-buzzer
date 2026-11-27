import type { TeacherGroupRosterItem } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../persistence/database.js';
import { listGroupRoster } from '../persistence/group-repository.js';

export function getTeacherGroupRoster(db: SqliteDatabase, sessionId: string, activityId: string): TeacherGroupRosterItem[] {
  const owner = db.prepare(`SELECT 1 FROM activities a JOIN user_sessions s ON s.id = a.created_by_session_id
    WHERE a.id = ? AND a.created_by_session_id = ? AND s.role = 'teacher' AND s.authenticated_at IS NOT NULL AND s.retired_at IS NULL`).get(activityId, sessionId);
  if (!owner) throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有登入的活動老師可以查看小組名冊。');
  return listGroupRoster(db, activityId);
}
