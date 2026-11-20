import { randomUUID } from 'node:crypto';
import type { ActivityPhase, ActivitySnapshot } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from './database.js';
import { HttpError } from '../../../api/validation.js';

interface ActivityRow { id: string; phase: ActivityPhase; revision: number }
const selectActivity = (db: SqliteDatabase, activityId: string): ActivityRow | undefined =>
  db.prepare('SELECT id, phase, revision FROM activities WHERE id = ?').get(activityId) as ActivityRow | undefined;

export function findActivity(db: SqliteDatabase, activityId: string): ActivitySnapshot {
  const row = selectActivity(db, activityId);
  if (!row) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  return { activityId: row.id, phase: row.phase, revision: row.revision };
}

export function createActivityRecord(db: SqliteDatabase, sessionId: string): ActivitySnapshot {
  const activityId = randomUUID();
  const now = new Date().toISOString();
  const create = db.transaction(() => {
    const session = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
    if (session.role !== 'teacher') throw new HttpError(403, 'TEACHER_REQUIRED', '只有老師可以建立活動。');
    db.prepare('INSERT INTO activities (id, phase, revision, created_by_session_id, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?)')
      .run(activityId, '準備中', sessionId, now, now);
    db.prepare('UPDATE user_sessions SET activity_id = ?, group_id = NULL, updated_at = ? WHERE id = ?')
      .run(activityId, now, sessionId);
  });
  create();
  return { activityId, phase: '準備中', revision: 0 };
}

export function updateActivityPhase(db: SqliteDatabase, activityId: string, phase: ActivityPhase, beforeUpdate?: () => void): ActivitySnapshot {
  const transition = db.transaction(() => {
    const current = selectActivity(db, activityId);
    if (!current) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
    const allowed: Partial<Record<ActivityPhase, ActivityPhase>> = { '準備中': '搶答進行中', '搶答進行中': '已結束' };
    if (allowed[current.phase] !== phase) {
      throw new HttpError(409, 'INVALID_PHASE_TRANSITION', current.phase === '已結束'
        ? '活動已結束，無法再次切換階段。'
        : `目前階段「${current.phase}」不能切換為「${String(phase)}」。`);
    }
    beforeUpdate?.();
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE activities SET phase = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
      .run(phase, now, activityId, current.revision);
    if (result.changes !== 1) throw new HttpError(409, 'INVALID_PHASE_TRANSITION', '活動階段已更新，請重新載入後再試。');
    return selectActivity(db, activityId)!;
  });
  const updated = transition.immediate();
  return { activityId: updated.id, phase: updated.phase, revision: updated.revision };
}
