import type { GroupRecord } from '@quiz-buzzer/shared';
import { HttpError, isRecord } from '../../../api/validation.js';
import type { SqliteDatabase } from '../persistence/database.js';
import { createGroupWithInviteCode, findGroupByInviteCode } from '../persistence/group-repository.js';
import { reconcileExpiredStudentSessions } from './student-session-presence-service.js';

export function enrollGroup(db: SqliteDatabase, sessionId: string, activityId: string, input: unknown): GroupRecord {
  if (typeof input === 'string') input = { mode: 'leader', groupName: input };
  if (!isRecord(input)) throw new HttpError(400, 'INVALID_ENROLLMENT', '請選擇組長建組或加入既有組別。');
  const mode = input.mode ?? ('groupName' in input ? 'leader' : undefined);
  const displayName = input.groupName;
  const inviteCode = input.inviteCode;
  if (mode === 'leader' && (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 100)) {
    throw new HttpError(400, 'INVALID_GROUP_NAME', '組別名稱不可空白，且長度不得超過 100 個字元。');
  }
  if (mode === 'member' && (typeof inviteCode !== 'string' || !/^\d{6}$/.test(inviteCode))) {
    throw new HttpError(400, 'INVALID_INVITE_CODE', '小組邀請碼必須為六位數字。');
  }
  if (mode !== 'leader' && mode !== 'member') throw new HttpError(400, 'INVALID_ENROLLMENT', '請選擇組長建組或加入既有組別。');

  const enroll = db.transaction((): GroupRecord => {
    const session = db.prepare('SELECT role, retired_at, activity_id, group_id FROM user_sessions WHERE id = ?').get(sessionId) as
      { role: string; retired_at: string | null; activity_id: string | null; group_id: string | null } | undefined;
    if (!session || session.retired_at) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新加入活動。');
    if (session.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', '只有學生可以加入活動組別。');
    const activity = db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId) as { phase: string } | undefined;
    if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動，請確認活動代碼。');
    if (activity.phase !== '準備中') throw new HttpError(409, 'ENROLLMENT_CLOSED', '活動已開始或結束，目前不開放加入組別。');
    if (session.group_id) {
      const previous = db.prepare('SELECT phase FROM activities WHERE id = ?').get(session.activity_id) as { phase: string } | undefined;
      if (session.activity_id === activityId || previous?.phase !== '已結束') {
        throw new HttpError(409, 'ALREADY_IN_GROUP', '此工作階段已加入尚未結束的組別，請先離開目前組別。');
      }
      const membership = db.prepare('SELECT group_role FROM user_sessions WHERE id = ?').get(sessionId) as { group_role: string | null };
      if (membership.group_role === 'leader') db.prepare('UPDATE groups SET accepts_members = 0 WHERE id = ?').run(session.group_id);
    }
    reconcileExpiredStudentSessions(db);

    let group: GroupRecord;
    let role: 'leader' | 'member';
    if (mode === 'leader') {
      try { group = createGroupWithInviteCode(db, activityId, (displayName as string).trim(), sessionId); }
      catch (error) {
        if (error instanceof Error && error.message === 'GROUP_LIMIT_REACHED') throw new HttpError(409, 'GROUP_LIMIT_REACHED', '此活動已達 100 組上限。');
        if (error instanceof Error && error.message === 'GROUP_NAME_TAKEN') throw new HttpError(409, 'GROUP_NAME_TAKEN', '此活動已有相同名稱的組別，請更換組別名稱。');
        throw error;
      }
      role = 'leader';
    } else {
      const found = findGroupByInviteCode(db, activityId, inviteCode as string);
      if (!found || found.accepts_members !== 1) throw new HttpError(404, 'GROUP_NOT_AVAILABLE', '找不到可加入的小組，請確認活動與邀請碼。');
      const active = (db.prepare("SELECT count(*) AS total FROM user_sessions WHERE group_id = ? AND role = 'student' AND retired_at IS NULL").get(found.id) as { total: number }).total;
      if (active >= 2) throw new HttpError(409, 'GROUP_FULL', '此小組目前已滿，請確認邀請碼或選擇其他小組。');
      group = { groupId: found.id, activityId, displayName: found.display_name, inviteCode: found.invite_code };
      role = 'member';
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE user_sessions SET activity_id = ?, group_id = ?, group_role = ?, disconnected_until = NULL, updated_at = ? WHERE id = ?')
      .run(activityId, group.groupId, role, now, sessionId);
    return group;
  });
  return enroll.immediate();
}

export function retireGroupSession(db: SqliteDatabase, sessionId: string): void {
  const row = db.prepare('SELECT group_id, group_role FROM user_sessions WHERE id = ?').get(sessionId) as { group_id: string | null; group_role: string | null } | undefined;
  if (row?.group_id && row.group_role === 'leader') db.prepare('UPDATE groups SET accepts_members = 0 WHERE id = ?').run(row.group_id);
}
