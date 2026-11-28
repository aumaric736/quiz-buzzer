import { randomUUID } from 'node:crypto';
import type { Role, UserSession } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from '../persistence/database.js';
import { HttpError } from '../../../api/validation.js';
import { restoreStudentPresence } from './student-session-presence-service.js';

export function requireActiveSession(db: SqliteDatabase, sessionId: string): void {
  const row = db.prepare('SELECT retired_at, role FROM user_sessions WHERE id = ?').get(sessionId) as { retired_at: string | null; role: string } | undefined;
  if (!row || row.retired_at) throw new HttpError(404, 'SESSION_NOT_FOUND', '此工作階段已結束或不存在，請重新選擇角色。');
}

export function createSession(db: SqliteDatabase, input: unknown): UserSession {
  if (input !== 'teacher' && input !== 'student') {
    throw new HttpError(400, 'INVALID_ROLE', '請選擇老師或學生角色。');
  }
  const session: UserSession = { sessionId: randomUUID(), role: input as Role, activityId: null, groupId: null };
  const now = new Date().toISOString();
  db.prepare('INSERT INTO user_sessions (id, role, authenticated_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(session.sessionId, session.role, session.role === 'teacher' ? now : null, now);
  return session;
}

export function getSession(db: SqliteDatabase, sessionId: string): UserSession {
  const role = db.prepare(`SELECT s.role, a.phase AS phase FROM user_sessions s
    LEFT JOIN activities a ON a.id = s.activity_id WHERE s.id = ?`).get(sessionId) as { role: Role; phase: string | null } | undefined;
  if (role?.role === 'student' && role.phase !== '已結束' && !restoreStudentPresence(db, sessionId)) {
    throw new HttpError(404, 'SESSION_NOT_FOUND', '學生工作階段已逾時，請使用活動代碼與小組邀請碼重新加入。');
  }
  const row = db.prepare(`SELECT s.id, s.role, s.activity_id, s.group_id, s.retired_at, s.group_role,
      s.disconnected_at, g.display_name AS group_name, g.invite_code AS group_invite_code,
      a.phase AS phase,
      (SELECT COUNT(*) FROM user_sessions online WHERE online.group_id = s.group_id AND online.id <> s.id
        AND online.role = 'student' AND online.retired_at IS NULL AND online.disconnected_at IS NULL) AS otherOnlineCount
    FROM user_sessions s LEFT JOIN groups g ON g.id = s.group_id
    LEFT JOIN activities a ON a.id = s.activity_id WHERE s.id = ?`).get(sessionId) as
    | { id: string; role: Role; activity_id: string | null; group_id: string | null; retired_at: string | null; group_role: 'leader' | 'member' | null; group_name: string | null; group_invite_code: string | null; disconnected_at: string | null; phase: string | null; otherOnlineCount: number }
    | undefined;
  if (!row || row.retired_at) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到此本機使用者工作階段，請重新選擇角色。');
  const recoveryRequired = row.role === 'student' && Boolean(row.disconnected_at && row.group_id && row.phase === '準備中' && row.otherOnlineCount >= 2);
  return { sessionId: row.id, role: row.role, activityId: row.activity_id, groupId: row.group_id, groupName: row.group_name,
    groupRole: row.group_role, groupInviteCode: row.group_invite_code, ...(recoveryRequired ? { recoveryRequired: true } : {}) };
}

export function retireSession(db: SqliteDatabase, sessionId: string): { sessionId: string; status: 'retired'; activityId: null; groupId: null } {
  const retire = db.transaction(() => {
    const row = db.prepare('SELECT id FROM user_sessions WHERE id = ?').get(sessionId);
    if (!row) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到此本機使用者工作階段，請重新選擇角色。');
    const now = new Date().toISOString();
    const group = db.prepare('SELECT group_id, group_role FROM user_sessions WHERE id = ?').get(sessionId) as { group_id: string | null; group_role: string | null } | undefined;
    if (group?.group_id && group.group_role === 'leader') db.prepare('UPDATE groups SET accepts_members = 0 WHERE id = ?').run(group.group_id);
    db.prepare('UPDATE user_sessions SET activity_id = NULL, group_id = NULL, disconnected_at = NULL, disconnected_until = NULL, retired_at = ?, updated_at = ? WHERE id = ? AND retired_at IS NULL')
      .run(now, now, sessionId);
  });
  retire.immediate();
  return { sessionId, status: 'retired', activityId: null, groupId: null };
}
