import type { SqliteDatabase } from '../persistence/database.js';

const RETENTION_MS = 2 * 60 * 1000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let presencePublisher: ((activityId: string, groupId: string) => void) | undefined;
let rosterPublisher: ((activityId: string) => void) | undefined;

export function configureStudentPresencePublisher(publish: (activityId: string, groupId: string) => void, publishRoster?: (activityId: string) => void): () => void {
  presencePublisher = publish; rosterPublisher = publishRoster;
  return () => { if (presencePublisher === publish) { presencePublisher = undefined; rosterPublisher = undefined; } };
}

function publishPresenceChange(db: SqliteDatabase, groupId: string | null): void {
  if (!groupId || db.inTransaction) return;
  const row = db.prepare('SELECT activity_id AS activityId FROM groups WHERE id = ?').get(groupId) as { activityId: string } | undefined;
  if (row) { presencePublisher?.(row.activityId, groupId); rosterPublisher?.(row.activityId); }
}

function incrementLiveRevisions(db: SqliteDatabase, groupId: string): void {
  db.prepare('UPDATE groups SET live_revision = live_revision + 1 WHERE id = ?').run(groupId);
  db.prepare('UPDATE activities SET live_revision = live_revision + 1 WHERE id = (SELECT activity_id FROM groups WHERE id = ?)').run(groupId);
}

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
  const disconnect = db.transaction(() => {
    const row = db.prepare("SELECT group_id AS groupId, disconnected_until AS disconnectedUntil FROM user_sessions WHERE id = ? AND role = 'student' AND retired_at IS NULL").get(sessionId) as
      { groupId: string | null; disconnectedUntil: string | null } | undefined;
    if (!row || row.disconnectedUntil || !row.groupId) return null;
    db.prepare("UPDATE user_sessions SET disconnected_until = ?, updated_at = ? WHERE id = ? AND role = 'student' AND retired_at IS NULL")
      .run(until, now.toISOString(), sessionId);
    incrementLiveRevisions(db, row.groupId);
    return row.groupId;
  });
  const groupId = disconnect.immediate();
  if (!groupId) return;
  scheduleExpiry(db, sessionId, until);
  publishPresenceChange(db, groupId);
}

export function restoreStudentPresence(db: SqliteDatabase, sessionId: string, now = new Date()): boolean {
  const restore = db.transaction(() => {
    const row = db.prepare("SELECT disconnected_until AS disconnectedUntil, retired_at AS retiredAt, group_id AS groupId, group_role AS groupRole FROM user_sessions WHERE id = ? AND role = 'student'").get(sessionId) as
      { disconnectedUntil: string | null; retiredAt: string | null; groupId: string | null; groupRole: string | null } | undefined;
    if (!row || row.retiredAt) return { valid: false, changedGroupId: null as string | null };
    if (!row.disconnectedUntil) return { valid: true, changedGroupId: null as string | null };
    if (Date.parse(row.disconnectedUntil) <= now.getTime()) {
      if (row.groupId) {
        if (row.groupRole === 'leader') db.prepare('UPDATE groups SET accepts_members = 0 WHERE id = ?').run(row.groupId);
        db.prepare('UPDATE user_sessions SET activity_id = NULL, group_id = NULL, disconnected_until = NULL, retired_at = ?, updated_at = ? WHERE id = ?')
          .run(now.toISOString(), now.toISOString(), sessionId);
        incrementLiveRevisions(db, row.groupId);
      }
      return { valid: false, changedGroupId: row.groupId };
    }
    db.prepare("UPDATE user_sessions SET disconnected_until = NULL, updated_at = ? WHERE id = ? AND role = 'student' AND retired_at IS NULL")
      .run(now.toISOString(), sessionId);
    if (row.groupId) incrementLiveRevisions(db, row.groupId);
    return { valid: true, changedGroupId: row.groupId };
  });
  const outcome = restore.immediate();
  const timer = timers.get(sessionId); if (timer) clearTimeout(timer); timers.delete(sessionId);
  publishPresenceChange(db, outcome.changedGroupId);
  return outcome.valid;
}

export function expireStudentSession(db: SqliteDatabase, sessionId: string, now = new Date()): void {
  const expire = db.transaction(() => {
    const row = db.prepare("SELECT group_id AS groupId, group_role AS groupRole, disconnected_until AS disconnectedUntil FROM user_sessions WHERE id = ? AND role = 'student' AND retired_at IS NULL").get(sessionId) as { groupId: string | null; groupRole: string | null; disconnectedUntil: string | null } | undefined;
    if (!row || !row.groupId || !row.disconnectedUntil || Date.parse(row.disconnectedUntil) > now.getTime()) return null;
    if (row.groupRole === 'leader') db.prepare('UPDATE groups SET accepts_members = 0 WHERE id = ?').run(row.groupId);
    db.prepare('UPDATE user_sessions SET activity_id = NULL, group_id = NULL, disconnected_until = NULL, retired_at = ?, updated_at = ? WHERE id = ?')
      .run(now.toISOString(), now.toISOString(), sessionId);
    incrementLiveRevisions(db, row.groupId);
    return row.groupId;
  });
  const groupId = expire.immediate();
  publishPresenceChange(db, groupId);
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
