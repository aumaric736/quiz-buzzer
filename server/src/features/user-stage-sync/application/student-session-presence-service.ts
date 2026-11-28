import type { SqliteDatabase } from '../persistence/database.js';
import { handoffDepartingLeader } from './group-service.js';

export const STUDENT_OFFLINE_GRACE_MS = 30_000;
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
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

function clearPendingDisconnect(sessionId: string): void {
  const timer = disconnectTimers.get(sessionId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(sessionId);
}

function classifyOffline(db: SqliteDatabase, sessionId: string, now: Date): void {
  const disconnect = db.transaction(() => {
    const row = db.prepare(`SELECT s.group_id AS groupId, s.disconnected_at AS disconnectedAt, a.phase AS phase
      FROM user_sessions s LEFT JOIN activities a ON a.id = s.activity_id
      WHERE s.id = ? AND s.role = 'student' AND s.retired_at IS NULL`)
      .get(sessionId) as { groupId: string | null; disconnectedAt: string | null; phase: string | null } | undefined;
    if (!row || row.disconnectedAt || !row.groupId) return null;
    db.prepare("UPDATE user_sessions SET disconnected_at = ?, disconnected_until = NULL, updated_at = ? WHERE id = ? AND role = 'student' AND retired_at IS NULL")
      .run(now.toISOString(), now.toISOString(), sessionId);
    handoffDepartingLeader(db, row.groupId, sessionId, row.phase ?? '');
    incrementLiveRevisions(db, row.groupId);
    return row.groupId;
  });
  publishPresenceChange(db, disconnect.immediate());
}

/** Clean closes classify immediately; unclean drops wait for the remaining heartbeat grace. */
export function markStudentDisconnected(db: SqliteDatabase, sessionId: string, now = new Date(), delayMs = 0): void {
  clearPendingDisconnect(sessionId);
  if (delayMs <= 0) { classifyOffline(db, sessionId, now); return; }
  const timer = setTimeout(() => {
    disconnectTimers.delete(sessionId);
    if (db.open) classifyOffline(db, sessionId, new Date());
  }, delayMs);
  timer.unref?.();
  disconnectTimers.set(sessionId, timer);
}

/** Restore a returning member immediately when possible. During formation a full original group
 * leaves the session offline so the student can choose another group through enrollment. */
export function restoreStudentPresence(db: SqliteDatabase, sessionId: string, now = new Date()): boolean {
  const restore = db.transaction(() => {
    const row = db.prepare(`SELECT s.disconnected_at AS disconnectedAt, s.disconnected_until AS legacyDeadline,
        s.retired_at AS retiredAt, s.group_id AS groupId, a.phase AS phase
      FROM user_sessions s LEFT JOIN activities a ON a.id = s.activity_id
      WHERE s.id = ? AND s.role = 'student'`).get(sessionId) as
      { disconnectedAt: string | null; legacyDeadline: string | null; retiredAt: string | null; groupId: string | null; phase: string | null } | undefined;
    if (!row || row.retiredAt) return { valid: false, changedGroupId: null as string | null };
    if (!row.disconnectedAt && !row.legacyDeadline) return { valid: true, changedGroupId: null as string | null };
    if (row.phase === '已結束') return { valid: false, changedGroupId: null as string | null };

    if (row.groupId && row.phase === '準備中') {
      const online = (db.prepare(`SELECT COUNT(*) AS count FROM user_sessions
        WHERE group_id = ? AND role = 'student' AND retired_at IS NULL
          AND disconnected_at IS NULL AND id <> ?`).get(row.groupId, sessionId) as { count: number }).count;
      if (online >= 2) return { valid: true, changedGroupId: null as string | null };
    }

    db.prepare("UPDATE user_sessions SET disconnected_at = NULL, disconnected_until = NULL, updated_at = ? WHERE id = ? AND role = 'student' AND retired_at IS NULL")
      .run(now.toISOString(), sessionId);
    if (row.groupId) incrementLiveRevisions(db, row.groupId);
    return { valid: true, changedGroupId: row.groupId };
  });
  const outcome = restore.immediate();
  clearPendingDisconnect(sessionId);
  publishPresenceChange(db, outcome.changedGroupId);
  return outcome.valid;
}

/** Compatibility name for callers that reconcile old deadline records; membership is never retired here. */
export function expireStudentSession(db: SqliteDatabase, sessionId: string, now = new Date()): void {
  clearPendingDisconnect(sessionId);
  classifyOffline(db, sessionId, now);
}

export function reconcileExpiredStudentSessions(db: SqliteDatabase, _now = new Date()): number {
  const sessionIds = db.prepare(`SELECT id FROM user_sessions
    WHERE role = 'student' AND retired_at IS NULL AND disconnected_until IS NOT NULL AND disconnected_at IS NULL`).all() as
    Array<{ id: string }>;
  const changedGroups = new Set<string>();
  const reconcile = db.transaction(() => {
    let reconciledCount = 0;
    for (const { id } of sessionIds) {
      const row = db.prepare(`SELECT s.group_id AS groupId, s.updated_at AS updatedAt, a.phase AS phase
        FROM user_sessions s LEFT JOIN activities a ON a.id = s.activity_id
        WHERE s.id = ? AND s.role = 'student' AND s.retired_at IS NULL
          AND s.disconnected_until IS NOT NULL AND s.disconnected_at IS NULL`).get(id) as
        { groupId: string | null; updatedAt: string; phase: string | null } | undefined;
      if (!row) continue;
      const result = db.prepare(`UPDATE user_sessions SET disconnected_at = ?, disconnected_until = NULL
        WHERE id = ? AND role = 'student' AND retired_at IS NULL
          AND disconnected_until IS NOT NULL AND disconnected_at IS NULL`).run(row.updatedAt, id);
      if (result.changes === 0) continue;
      reconciledCount += 1;
      if (row.groupId) {
        handoffDepartingLeader(db, row.groupId, id, row.phase ?? '');
        incrementLiveRevisions(db, row.groupId);
        changedGroups.add(row.groupId);
      }
    }
    return reconciledCount;
  });
  const reconciledCount = reconcile.immediate();
  for (const groupId of changedGroups) publishPresenceChange(db, groupId);
  return reconciledCount;
}

export function schedulePendingStudentExpirations(db: SqliteDatabase, now = new Date()): void {
  reconcileExpiredStudentSessions(db, now);
}
