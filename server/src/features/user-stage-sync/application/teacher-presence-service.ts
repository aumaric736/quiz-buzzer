import type { SqliteDatabase } from '../persistence/database.js';
import type { ActivityPhaseUpdatedEvent } from '@quiz-buzzer/shared';
import { activityOperationQueue } from '../../buzzer-flow/application/activity-operation-queue.js';
import { recordActivityOperation } from '../../buzzer-flow/persistence/activity-operation-repository.js';

const GRACE_MS = 2 * 60 * 1000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let phasePublisher: ((event: ActivityPhaseUpdatedEvent) => void) | undefined;

export function configureTeacherEndPublisher(publish: (event: ActivityPhaseUpdatedEvent) => void): void {
  phasePublisher = publish;
}

function endActivity(db: SqliteDatabase, activityId: string): void {
  const row = db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activityId) as { phase: string; revision: number } | undefined;
  if (!row || row.phase === '已結束') return;
  recordActivityOperation(db, activityId, 'end');
  const now = new Date().toISOString();
  db.prepare("UPDATE activities SET phase = '已結束', revision = revision + 1, teacher_disconnected_until = NULL, updated_at = ? WHERE id = ? AND revision = ?")
    .run(now, activityId, row.revision);
  phasePublisher?.({ type: 'activity.phase.updated', activityId, phase: '已結束', revision: row.revision + 1 });
}

function scheduleExpiry(db: SqliteDatabase, activityId: string, until: string): void {
  const existing = timers.get(activityId);
  if (existing) clearTimeout(existing);
  const delay = Math.max(0, Date.parse(until) - Date.now());
  const timer = setTimeout(() => {
    void activityOperationQueue.run(activityId, () => {
      if (!db.open) { timers.delete(activityId); return; }
      const row = db.prepare('SELECT phase, teacher_disconnected_until FROM activities WHERE id = ?').get(activityId) as { phase: string; teacher_disconnected_until: string | null } | undefined;
      if (row && row.phase !== '已結束' && row.teacher_disconnected_until && Date.parse(row.teacher_disconnected_until) <= Date.now()) endActivity(db, activityId);
      timers.delete(activityId);
    });
  }, delay);
  timer.unref?.();
  timers.set(activityId, timer);
}

export function markTeacherDisconnected(db: SqliteDatabase, sessionId: string, now = new Date()): void {
  const until = new Date(now.getTime() + GRACE_MS).toISOString();
  const rows = db.prepare("SELECT id FROM activities WHERE created_by_session_id = ? AND phase != '已結束'").all(sessionId) as Array<{ id: string }>;
  db.prepare("UPDATE activities SET teacher_disconnected_until = ? WHERE created_by_session_id = ? AND phase != '已結束'").run(until, sessionId);
  rows.forEach(({ id }) => scheduleExpiry(db, id, until));
}

export async function restoreTeacherPresence(db: SqliteDatabase, sessionId: string, now = new Date()): Promise<boolean> {
  const rows = db.prepare("SELECT id, phase, teacher_disconnected_until FROM activities WHERE created_by_session_id = ? AND phase != '已結束'").all(sessionId) as Array<{ id: string; phase: string; teacher_disconnected_until: string | null }>;
  for (const row of rows) {
    if (row.teacher_disconnected_until && Date.parse(row.teacher_disconnected_until) <= now.getTime()) {
      await activityOperationQueue.run(row.id, () => endActivity(db, row.id));
      continue;
    }
    if (row.teacher_disconnected_until) db.prepare('UPDATE activities SET teacher_disconnected_until = NULL WHERE id = ?').run(row.id);
    const timer = timers.get(row.id);
    if (timer) clearTimeout(timer);
    timers.delete(row.id);
  }
  return true;
}

/** Run before opening the listener, so no user operation races startup reconciliation. */
export function reconcileExpiredTeacherPresence(db: SqliteDatabase, now = new Date()): number {
  const rows = db.prepare("SELECT id FROM activities WHERE phase != '已結束' AND teacher_disconnected_until IS NOT NULL AND teacher_disconnected_until <= ?")
    .all(now.toISOString()) as Array<{ id: string }>;
  rows.forEach(({ id }) => {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
    endActivity(db, id);
  });
  return rows.length;
}

export function schedulePendingTeacherPresence(db: SqliteDatabase, now = new Date()): void {
  const rows = db.prepare("SELECT id, teacher_disconnected_until FROM activities WHERE phase != '已結束' AND teacher_disconnected_until IS NOT NULL")
    .all() as Array<{ id: string; teacher_disconnected_until: string }>;
  for (const row of rows) {
    if (Date.parse(row.teacher_disconnected_until) <= now.getTime()) endActivity(db, row.id);
    else scheduleExpiry(db, row.id, row.teacher_disconnected_until);
  }
}

export async function endActivitiesForTeacherLeave(db: SqliteDatabase, sessionId: string): Promise<void> {
  const rows = db.prepare("SELECT id FROM activities WHERE created_by_session_id = ? AND phase != '已結束'").all(sessionId) as Array<{ id: string }>;
  for (const { id } of rows) {
    await activityOperationQueue.run(id, () => endActivity(db, id));
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  }
}
