import type { GroupRecord } from '@quiz-buzzer/shared';
import { HttpError, isRecord } from '../../../api/validation.js';
import type { SqliteDatabase } from '../persistence/database.js';
import { createGroupWithInviteCode, findGroupByInviteCode } from '../persistence/group-repository.js';

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

  const requestingSession = db.prepare(`SELECT role, retired_at AS retiredAt, activity_id AS activityId,
      group_id AS groupId, group_role AS groupRole, disconnected_at AS disconnectedAt
    FROM user_sessions WHERE id = ?`).get(sessionId) as
    { role: string; retiredAt: string | null; activityId: string | null; groupId: string | null; groupRole: 'leader' | 'member' | null; disconnectedAt: string | null } | undefined;
  if (!requestingSession || requestingSession.retiredAt) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新加入活動。');
  if (requestingSession.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', '只有學生可以加入活動組別。');
  if (!db.prepare('SELECT 1 FROM activities WHERE id = ?').get(activityId)) {
    throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動，請確認活動代碼。');
  }

  const enroll = db.transaction((): GroupRecord => {
    const session = db.prepare(`SELECT role, retired_at, activity_id, group_id, group_role,
        disconnected_at, disconnected_until FROM user_sessions WHERE id = ?`).get(sessionId) as
      { role: string; retired_at: string | null; activity_id: string | null; group_id: string | null;
        group_role: 'leader' | 'member' | null; disconnected_at: string | null; disconnected_until: string | null } | undefined;
    if (!session || session.retired_at) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新加入活動。');
    if (session.role !== 'student') throw new HttpError(403, 'STUDENT_REQUIRED', '只有學生可以加入活動組別。');
    const activity = db.prepare('SELECT phase, joining_opened_at AS joiningOpenedAt FROM activities WHERE id = ?').get(activityId) as
      { phase: string; joiningOpenedAt: string | null } | undefined;
    if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動，請確認活動代碼。');
    if (activity.phase !== '準備中') throw new HttpError(409, 'ENROLLMENT_CLOSED', '活動已開始或結束，目前不開放加入組別。');
    if (!activity.joiningOpenedAt) throw new HttpError(409, 'JOINING_NOT_OPEN', '老師尚未開放加入，請等待老師匯入題目並開放小組加入。');
    const isRecovering = Boolean(session.group_id && session.disconnected_at);
    if (session.group_id) {
      const previous = db.prepare('SELECT phase FROM activities WHERE id = ?').get(session.activity_id) as { phase: string } | undefined;
      if (isRecovering) {
        if (session.activity_id !== activityId) throw new HttpError(409, 'ALREADY_IN_GROUP', '請先恢復原活動的小組身分，再加入其他活動。');
      } else if (session.activity_id === activityId || previous?.phase !== '已結束') {
        throw new HttpError(409, 'ALREADY_IN_GROUP', '此工作階段已加入尚未結束的小組。');
      } else if (session.group_role === 'leader') {
        db.prepare('UPDATE groups SET accepts_members = 0 WHERE id = ?').run(session.group_id);
      }
    }
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
      const online = (db.prepare(`SELECT count(*) AS total FROM user_sessions WHERE group_id = ? AND role = 'student'
        AND retired_at IS NULL AND disconnected_at IS NULL`).get(found.id) as { total: number }).total;
      if (online >= 2) throw new HttpError(409, 'GROUP_FULL', session.group_id === found.id
        ? '原小組已額滿，請選擇其他有空位的小組。' : '此小組目前已滿，請選擇其他有空位的小組。');
      group = { groupId: found.id, activityId, displayName: found.display_name, inviteCode: found.invite_code };
      role = session.group_id === found.id && session.group_role
        ? session.group_role
        : found.leader_session_id === null && online === 0 ? 'leader' : 'member';
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE user_sessions SET activity_id = ?, group_id = ?, group_role = ?, disconnected_at = NULL, disconnected_until = NULL, updated_at = ? WHERE id = ?')
      .run(activityId, group.groupId, role, now, sessionId);
    if (mode === 'member' && role === 'leader') {
      db.prepare('UPDATE groups SET leader_session_id = ? WHERE id = ? AND leader_session_id IS NULL')
        .run(sessionId, group.groupId);
    }
    db.prepare('UPDATE groups SET live_revision = live_revision + 1 WHERE id = ?').run(group.groupId);
    db.prepare('UPDATE activities SET live_revision = live_revision + 1 WHERE id = ?').run(activityId);
    const counts = db.prepare(`SELECT g.accepts_members AS acceptsMembers, g.live_revision AS groupLiveRevision,
        (SELECT count(*) FROM user_sessions online WHERE online.group_id = g.id AND online.role = 'student'
          AND online.retired_at IS NULL AND online.disconnected_at IS NULL) AS onlineCount,
        (SELECT count(*) FROM user_sessions occupied WHERE occupied.group_id = g.id AND occupied.role = 'student'
          AND occupied.retired_at IS NULL) AS occupiedCount
      FROM groups g WHERE g.id = ?`).get(group.groupId) as {
        acceptsMembers: number; groupLiveRevision: number; onlineCount: number; occupiedCount: number
      };
    return { ...group, groupRole: role, onlineCount: counts.onlineCount, occupiedCount: counts.occupiedCount,
      groupLiveRevision: counts.groupLiveRevision, capacity: 2, acceptsMembers: counts.acceptsMembers === 1 };
  });
  return enroll.immediate();
}

/** Reassign or clear leadership during team formation. The caller owns revision increments. */
export function handoffDepartingLeader(db: SqliteDatabase, groupId: string, sessionId: string, phase: string): boolean {
  const group = db.prepare('SELECT leader_session_id AS leaderSessionId FROM groups WHERE id = ?').get(groupId) as
    { leaderSessionId: string | null } | undefined;
  if (!group || group.leaderSessionId !== sessionId || phase !== '準備中') return false;

  const successor = db.prepare(`SELECT id FROM user_sessions WHERE group_id = ? AND id <> ? AND role = 'student'
      AND retired_at IS NULL AND disconnected_at IS NULL ORDER BY updated_at, id LIMIT 1`)
    .get(groupId, sessionId) as { id: string } | undefined;
  db.prepare("UPDATE user_sessions SET group_role = 'member' WHERE id = ? AND group_id = ?")
    .run(sessionId, groupId);
  if (successor) db.prepare("UPDATE user_sessions SET group_role = 'leader' WHERE id = ? AND group_id = ?")
    .run(successor.id, groupId);
  db.prepare('UPDATE groups SET leader_session_id = ? WHERE id = ?').run(successor?.id ?? null, groupId);
  return true;
}
