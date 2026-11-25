import type { GroupRecord } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../persistence/database.js';
import { insertGroup } from '../persistence/group-repository.js';

export function normalizeGroupName(displayName: string): string {
  return displayName.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

export function enrollGroup(db: SqliteDatabase, sessionId: string, activityId: string, input: unknown): GroupRecord {
  if (typeof input !== 'string' || input.trim().length === 0 || input.trim().length > 100) {
    throw new HttpError(400, 'INVALID_GROUP_NAME', '組別名稱不可空白，且長度不得超過 100 個字元。');
  }
  const displayName = input.trim();
  const normalizedName = normalizeGroupName(displayName);

  const enroll = db.transaction((): GroupRecord => {
    const session = db.prepare('SELECT role, retired_at FROM user_sessions WHERE id = ?').get(sessionId) as { role: string; retired_at: string | null } | undefined;
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
    if (session.retired_at) throw new HttpError(404, 'SESSION_NOT_FOUND', '此工作階段已結束，請重新選擇角色。');
    if (session.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', '只有學生可以加入活動組別。');
    const activity = db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId) as { phase: string } | undefined;
    if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動，請確認活動代碼。');
    if (activity.phase !== '準備中') throw new HttpError(409, 'ENROLLMENT_CLOSED', '活動已開始或結束，目前不開放加入組別。');

    const group = insertGroup(db, activityId, displayName, normalizedName);
    db.prepare('UPDATE user_sessions SET activity_id = ?, group_id = ?, updated_at = ? WHERE id = ?')
      .run(activityId, group.groupId, new Date().toISOString(), sessionId);
    return group;
  });

  try { return enroll(); }
  catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: groups.activity_id, groups.normalized_name')) {
      throw new HttpError(409, 'GROUP_NAME_TAKEN', '此活動已有相同名稱的組別，請更換組別名稱。');
    }
    throw error;
  }
}
