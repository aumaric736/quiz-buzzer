import type { SqliteDatabase } from '../persistence/database.js';

const RETENTION_MS = 2 * 60 * 1000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleExpiry(db: SqliteDatabase, sessionId: string, until: string): void {
  const previous = timers.get(sessionId);
  if (previous) clearTimeout(previous);
  const timer = setTimeout(() => {
    const row = db.open ? db.prepare('SELECT disconnected_until FROM user_sessions WHERE id = ?').get(sessionId) as { disconnected_until: string | null } | undefined : undefined;
    if (row?.disconnected_until && Date.parse(row.disconnected_until) <= Date.now()) expireStudentSession(db, sessionId);
    timers.delete(sessionId);
  }, Math.max(0, Date.parse(until) - Date.now()));
  timer.unref?.();
  timers.set(sessionId, timer);
}

export function markStudentDisconnected(db: SqliteDatabase, sessionId: string, now = new Date()): void {
  const until = new Date(now.getTime() + RETENTION_MS).toISOString();
  db.prepare("UPDATE user_sessions SET disconnected_until = ?, updated_at = ? WHERE id = ? AND role = 'student' AND retired_at IS NULL")
    .run(until, now.toISOString(), sessionId);
  scheduleExpiry(db, sessionId, until);
}

export function restoreStudentPresence(db: SqliteDatabase, sessionId: string, now = new Date()): boolean {
  const row = db.prepare('SELECT disconnected_until, retired_at FROM user_sessions WHERE id = ?').get(sessionId) as { disconnected_until: string | null; retired_at: string | null } | undefined;
  if (!row || row.retired_at) return false;
  if (row.disconnected_until && Date.parse(row.disconnected_until) <= now.getTime()) {
    const timer = timers.get(sessionId); if (timer) clearTimeout(timer); timers.delete(sessionId);
    expireStudentSession(db, sessionId, now);
    return false;
  }
  db.prepare('UPDATE user_sessions SET disconnected_until = NULL, updated_at = ? WHERE id = ? AND role = \'student\' AND retired_at IS NULL')
    .run(now.toISOString(), sessionId);
  const timer = timers.get(sessionId); if (timer) clearTimeout(timer); timers.delete(sessionId);
  return true;
}

export function expireStudentSession(db: SqliteDatabase, sessionId: string, now = new Date()): void {
  const expire = db.transaction(() => {
    const row = db.prepare("SELECT group_id, group_role FROM user_sessions WHERE id = ? AND role = 'student' AND retired_at IS NULL").get(sessionId) as { group_id: string | null; group_role: string | null } | undefined;
    if (!row) return;
    if (row.group_id && row.group_role === 'leader') db.prepare('UPDATE groups SET accepts_members = 0 WHERE id = ?').run(row.group_id);
    db.prepare('UPDATE user_sessions SET activity_id = NULL, group_id = NULL, disconnected_until = NULL, retired_at = ?, updated_at = ? WHERE id = ?')
      .run(now.toISOString(), now.toISOString(), sessionId);
  });
  expire.immediate();
  const timer = timers.get(sessionId); if (timer) clearTimeout(timer); timers.delete(sessionId);
}

export function reconcileExpiredStudentSessions(db: SqliteDatabase, now = new Date()): number {
  const rows = db.prepare("SELECT id FROM user_sessions WHERE role = 'student' AND retired_at IS NULL AND disconnected_until IS NOT NULL AND disconnected_until <= ?")
    .all(now.toISOString()) as Array<{ id: string }>;
  rows.forEach(({ id }) => expireStudentSession(db, id, now));
  return rows.length;
}

export function schedulePendingStudentExpirations(db: SqliteDatabase, now = new Date()): void {
  const rows = db.prepare("SELECT id, disconnected_until FROM user_sessions WHERE role = 'student' AND retired_at IS NULL AND disconnected_until IS NOT NULL")
    .all() as Array<{ id: string; disconnected_until: string }>;
  for (const row of rows) {
    if (Date.parse(row.disconnected_until) <= now.getTime()) expireStudentSession(db, row.id, now);
    else scheduleExpiry(db, row.id, row.disconnected_until);
  }
}
