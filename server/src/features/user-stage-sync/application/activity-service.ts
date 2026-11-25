import { ACTIVITY_PHASES, type ActivityPhase, type ActivitySnapshot } from '@quiz-buzzer/shared';
import type { SqliteDatabase } from '../persistence/database.js';
import { HttpError } from '../../../api/validation.js';
import { createActivityRecord, findActivity, updateActivityPhase } from '../persistence/activity-repository.js';

function requireTeacher(db: SqliteDatabase, sessionId: string, activityId?: string): void {
  const session = db.prepare('SELECT role, retired_at FROM user_sessions WHERE id = ?').get(sessionId) as { role: string; retired_at: string | null } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  if (session.retired_at) throw new HttpError(404, 'SESSION_NOT_FOUND', '此工作階段已結束，請重新選擇角色。');
  if (session.role !== 'teacher') throw new HttpError(403, 'TEACHER_REQUIRED', '只有老師可以執行此操作。');
  if (activityId) {
    const activity = db.prepare('SELECT created_by_session_id FROM activities WHERE id = ?').get(activityId) as { created_by_session_id: string } | undefined;
    if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
    if (activity.created_by_session_id !== sessionId) throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有建立此活動的老師可以切換階段。');
  }
}

export function createActivity(db: SqliteDatabase, sessionId: string): ActivitySnapshot {
  requireTeacher(db, sessionId);
  return createActivityRecord(db, sessionId);
}

export function getActivity(db: SqliteDatabase, activityId: string): ActivitySnapshot {
  return findActivity(db, activityId);
}

function requireImportedQuestions(db: SqliteDatabase, activityId: string): void {
  const rows = db.prepare(`SELECT q.question_number AS questionNumber, COUNT(m.slot_order) AS blankCount,
      MIN(m.slot_order) AS firstSlot, MAX(m.slot_order) AS lastSlot
    FROM activity_questions q
    LEFT JOIN guided_notes_sources s ON s.activity_id = q.activity_id
    LEFT JOIN guided_notes_blank_mappings m
      ON m.source_id = s.id AND m.activity_id = q.activity_id AND m.question_number = q.question_number
    WHERE q.activity_id = ?
    GROUP BY q.question_number
    ORDER BY q.question_number`).all(activityId) as Array<{
      questionNumber: number; blankCount: number; firstSlot: number | null; lastSlot: number | null
    }>;
  if (rows.length === 0) {
    throw new HttpError(409, 'QUESTIONS_REQUIRED', '開始搶答前，請先匯入至少一題 Guided Notes 題目。');
  }
  if (rows.some((row) => row.blankCount < 1 || row.firstSlot !== 0 || row.lastSlot !== row.blankCount - 1)) {
    throw new HttpError(409, 'QUESTION_MAPPINGS_INVALID', 'Guided Notes 題目缺少有效填空位置，請重新匯入講義後再開始。');
  }
}

export function transitionActivity(db: SqliteDatabase, sessionId: string, activityId: string, input: unknown): ActivitySnapshot {
  requireTeacher(db, sessionId, activityId);
  if (!ACTIVITY_PHASES.includes(input as ActivityPhase)) {
    throw new HttpError(409, 'INVALID_PHASE_TRANSITION', '階段只能依序由準備中切換為搶答進行中，再切換為已結束。');
  }
  const phase = input as ActivityPhase;
  return updateActivityPhase(db, activityId, phase, phase === '搶答進行中' ? () => requireImportedQuestions(db, activityId) : undefined);
}
