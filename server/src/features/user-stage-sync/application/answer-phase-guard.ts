import type { SqliteDatabase } from '../persistence/database.js';
import { HttpError } from '../../../api/validation.js';

export function checkAnswerAttempt(db: SqliteDatabase, sessionId: string, activityId: string): { allowed: true } {
  const session = db.prepare('SELECT role, activity_id, group_id FROM user_sessions WHERE id = ?').get(sessionId) as
    { role: string; activity_id: string | null; group_id: string | null } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  if (session.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', '只有已加入活動的學生可以檢查作答許可。');
  if (session.activity_id !== activityId || !session.group_id) throw new HttpError(403, 'ACTIVITY_MEMBERSHIP_REQUIRED', '請先加入活動組別再進入作答流程。');
  const activity = db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId) as { phase: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (activity.phase === '準備中') throw new HttpError(409, 'ANSWER_NOT_STARTED', '活動尚未開始，現在不能作答。');
  if (activity.phase === '已結束') throw new HttpError(409, 'ANSWER_ACTIVITY_ENDED', '活動已結束，現在不能作答。');
  return { allowed: true };
}
