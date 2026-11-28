import { randomUUID } from 'node:crypto';
import type { ActivityPhase, ActivitySnapshot } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from './database.js';
import { HttpError } from '../../../api/validation.js';

interface ActivityRow { id: string; phase: ActivityPhase; revision: number }
const selectActivity = (db: SqliteDatabase, activityId: string): ActivityRow | undefined =>
  db.prepare('SELECT id, phase, revision FROM activities WHERE id = ?').get(activityId) as ActivityRow | undefined;

export function findActivity(db: SqliteDatabase, activityId: string): ActivitySnapshot {
  const row = db.prepare('SELECT id, phase, revision, joining_opened_at AS joiningOpenedAt FROM activities WHERE id = ?').get(activityId) as
    { id: string; phase: ActivityPhase; revision: number; joiningOpenedAt: string | null } | undefined;
  if (!row) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  return { activityId: row.id, phase: row.phase, revision: row.revision, joiningOpenedAt: row.joiningOpenedAt };
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
    return db.prepare('SELECT id, phase, revision, joining_opened_at AS joiningOpenedAt FROM activities WHERE id = ?').get(activityId) as
      ActivityRow & { joiningOpenedAt: string | null };
  });
  const updated = transition.immediate();
  return { activityId: updated.id, phase: updated.phase, revision: updated.revision, joiningOpenedAt: updated.joiningOpenedAt };
}

export function openActivityJoiningRecord(db: SqliteDatabase, activityId: string): ActivitySnapshot {
  const open = db.transaction(() => {
    const activity = db.prepare('SELECT id, phase, revision, joining_opened_at AS joiningOpenedAt FROM activities WHERE id = ?').get(activityId) as
      (ActivityRow & { joiningOpenedAt: string | null }) | undefined;
    if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
    if (activity.phase !== '準備中') throw new HttpError(409, 'JOINING_OPEN_PHASE_INVALID', '只有在準備中階段可以開放學生加入。');
    if (activity.joiningOpenedAt) throw new HttpError(409, 'JOINING_ALREADY_OPEN', '小組加入已開放，學習單與題目清單已鎖定。');

    const readiness = db.prepare(`SELECT q.question_number AS questionNumber, COUNT(m.slot_order) AS mappingCount,
        MIN(m.slot_order) AS firstSlot, MAX(m.slot_order) AS lastSlot
      FROM activity_questions q
      LEFT JOIN guided_notes_sources s ON s.activity_id = q.activity_id
      LEFT JOIN guided_notes_blank_mappings m
        ON m.source_id = s.id AND m.activity_id = q.activity_id AND m.question_number = q.question_number
      WHERE q.activity_id = ? GROUP BY q.question_number`).all(activityId) as Array<{
        questionNumber: number; mappingCount: number; firstSlot: number | null; lastSlot: number | null
      }>;
    if (readiness.length === 0) throw new HttpError(409, 'QUESTIONS_REQUIRED', '開放加入前，請先匯入至少一題 Guided Notes 題目。');
    if (readiness.some((question) => question.mappingCount === 0 || question.firstSlot !== 0 || question.lastSlot !== question.mappingCount - 1)) {
      throw new HttpError(409, 'QUESTION_MAPPINGS_INVALID', '有題目缺少從 0 開始且連續的作答欄位，請先修正學習單。');
    }

    const now = new Date().toISOString();
    const updated = db.prepare(`UPDATE activities SET joining_opened_at = ?, live_revision = live_revision + 1,
      updated_at = ? WHERE id = ? AND joining_opened_at IS NULL AND phase = '準備中' AND revision = ?`)
      .run(now, now, activityId, activity.revision);
    if (updated.changes !== 1) throw new HttpError(409, 'JOINING_STATE_CHANGED', '活動狀態已更新，請重新載入後再試。');
    return db.prepare('SELECT id, phase, revision, joining_opened_at AS joiningOpenedAt FROM activities WHERE id = ?').get(activityId) as
      ActivityRow & { joiningOpenedAt: string | null };
  });
  const result = open.immediate();
  return { activityId: result.id, phase: result.phase, revision: result.revision, joiningOpenedAt: result.joiningOpenedAt };
}
