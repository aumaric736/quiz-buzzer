import type { GuidedNotesExportResult, WinningAnswerProvider } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import type { SheetsGateway } from '../google-sheets/sheets-gateway.js';
import { buildExportPreview } from './build-export-preview.js';
import { confirmGuidedNotesExport } from './confirm-guided-notes-export.js';

export async function retryGuidedNotesExport(
  db: SqliteDatabase,
  sheets: SheetsGateway,
  answers: WinningAnswerProvider,
  sessionId: string,
  activityId: string,
  exportId: string
): Promise<GuidedNotesExportResult> {
  const attempt = db.prepare('SELECT status, activity_id, created_by_session_id, updated_at FROM guided_notes_export_attempts WHERE id = ?')
    .get(exportId) as { status: string; activity_id: string; created_by_session_id: string; updated_at: string } | undefined;
  if (!attempt || attempt.activity_id !== activityId || attempt.created_by_session_id !== sessionId) {
    throw new HttpError(404, 'EXPORT_NOT_FOUND', '找不到此活動的匯出結果。');
  }
  if (!['pending', 'failed', 'unknown'].includes(attempt.status)) {
    throw new HttpError(409, 'EXPORT_NOT_RETRYABLE', '只有尚未確認或失敗的匯出可以安全重試。');
  }
  if (attempt.status === 'pending' && Date.now() - Date.parse(attempt.updated_at) < 2 * 60 * 1000) {
    throw new HttpError(409, 'EXPORT_IN_PROGRESS', '匯出仍在處理中，請稍後確認狀態再重試。');
  }
  // A fresh preview rereads the source worksheet and immutable final answer
  // snapshot before the write, so filled or changed cells are never overwritten.
  const preview = await buildExportPreview(db, sheets, answers, sessionId, activityId);
  return confirmGuidedNotesExport(db, sheets, answers, sessionId, activityId, preview.previewId);
}
