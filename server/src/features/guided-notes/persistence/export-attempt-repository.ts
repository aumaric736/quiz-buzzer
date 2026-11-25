import type { GuidedNotesExportResult } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { requireActiveSession } from '../../user-stage-sync/application/session-service.js';

interface ExportAttemptRecord {
  id: string;
  activity_id: string;
  created_by_session_id: string;
  status: GuidedNotesExportResult['status'] | 'previewed';
  written_question_numbers: string;
  unchanged_question_numbers: string;
  failed_question_numbers: string;
}

function parseQuestionNumbers(value: string): number[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((number) => Number.isSafeInteger(number) && number > 0) ? parsed as number[] : [];
  } catch { return []; }
}

export function getExportAttemptResult(db: SqliteDatabase, sessionId: string, activityId: string, exportId: string): GuidedNotesExportResult {
  requireActiveSession(db, sessionId);
  const session = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  if (session.role !== 'teacher') throw new HttpError(403, 'TEACHER_REQUIRED', '只有老師可以查詢 Guided Notes 匯出結果。');
  const activity = db.prepare('SELECT created_by_session_id FROM activities WHERE id = ?').get(activityId) as { created_by_session_id: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (activity.created_by_session_id !== sessionId) throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有建立此活動的老師可以查詢匯出結果。');
  const attempt = db.prepare(`SELECT id, activity_id, created_by_session_id, status, written_question_numbers,
    unchanged_question_numbers, failed_question_numbers FROM guided_notes_export_attempts WHERE id = ?`)
    .get(exportId) as ExportAttemptRecord | undefined;
  if (!attempt || attempt.activity_id !== activityId || attempt.created_by_session_id !== sessionId) {
    throw new HttpError(404, 'EXPORT_NOT_FOUND', '找不到此匯出結果。');
  }
  return {
    exportId: attempt.id,
    status: attempt.status,
    writtenQuestionNumbers: parseQuestionNumbers(attempt.written_question_numbers),
    unchangedQuestionNumbers: parseQuestionNumbers(attempt.unchanged_question_numbers),
    failedQuestionNumbers: parseQuestionNumbers(attempt.failed_question_numbers)
  };
}
