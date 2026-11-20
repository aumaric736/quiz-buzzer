import type { GuidedNotesExportResult, WinningAnswerProvider } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { computeAnswerSnapshotHash, validateAnswerResults } from './build-export-preview.js';
import { detectGuidedNotesLayout, LayoutRecognitionError } from '../domain/layout-recognizer.js';
import { getGuidedNotesSource, listActivityQuestions, listGuidedNotesMappings } from '../persistence/guided-notes-repository.js';
import { SheetsGatewayError, type SheetsCell, type SheetsCellUpdate, type SheetsGateway, type SheetsWorksheetGrid } from '../google-sheets/sheets-gateway.js';

interface ExportAttemptRow {
  id: string;
  activity_id: string;
  created_by_session_id: string;
  status: string;
  source_fingerprint: string;
  answer_snapshot_hash: string;
  preview_expires_at: string;
}

function setAttempt(db: SqliteDatabase, id: string, status: string, written: number[], unchanged: number[], failed: number[]): void {
  db.prepare(`UPDATE guided_notes_export_attempts SET status = ?, written_question_numbers = ?,
    unchanged_question_numbers = ?, failed_question_numbers = ?, updated_at = ? WHERE id = ?`)
    .run(status, JSON.stringify(written), JSON.stringify(unchanged), JSON.stringify(failed), new Date().toISOString(), id);
}

function safeProviderFailure(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof SheetsGatewayError) {
    if (error.code === 'WRITE_DENIED' || error.code === 'ACCESS_DENIED') throw new HttpError(403, 'SHEETS_WRITE_DENIED', '服務帳戶沒有講義編輯權限，請分享文件並授予編輯者權限。');
    if (error.code === 'NOT_FOUND') throw new HttpError(404, 'WORKSHEET_NOT_FOUND', '找不到原講義或工作表，請重新匯入。');
    if (error.code === 'NOT_CONFIGURED') throw new HttpError(503, 'SHEETS_NOT_CONFIGURED', '伺服器尚未設定 Google Sheets 服務帳戶環境變數。');
    throw new HttpError(502, 'SHEETS_WRITE_FAILED', 'Google Sheets 寫入失敗，請確認權限後重試。');
  }
  throw new HttpError(502, 'SHEETS_WRITE_FAILED', 'Google Sheets 寫入失敗，請稍後重試。');
}

function currentCellValue(cells: SheetsCell[], rowIndex: number, columnIndex: number): string | number | boolean | null {
  const cell = cells.find((item) => item.rowIndex === rowIndex && item.columnIndex === columnIndex);
  return cell?.enteredValue ?? null;
}

function resultFor(exportId: string, status: GuidedNotesExportResult['status'], written: number[], unchanged: number[], failed: number[]): GuidedNotesExportResult {
  return { exportId, status, writtenQuestionNumbers: written, unchangedQuestionNumbers: unchanged, failedQuestionNumbers: failed };
}

export async function confirmGuidedNotesExport(
  db: SqliteDatabase,
  sheets: SheetsGateway,
  answers: WinningAnswerProvider,
  sessionId: string,
  activityId: string,
  previewId: string
): Promise<GuidedNotesExportResult> {
  const session = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  if (session.role !== 'teacher') throw new HttpError(403, 'TEACHER_REQUIRED', '只有老師可以確認 Guided Notes 匯出。');
  const activity = db.prepare('SELECT created_by_session_id, phase FROM activities WHERE id = ?').get(activityId) as { created_by_session_id: string; phase: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (activity.created_by_session_id !== sessionId) throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有建立此活動的老師可以匯出 Guided Notes。');
  if (activity.phase !== '已結束') throw new HttpError(409, 'ACTIVITY_NOT_ENDED', '請先結束活動，再確認答案寫回。');

  const attempt = db.prepare(`SELECT id, activity_id, created_by_session_id, status, source_fingerprint,
    answer_snapshot_hash, preview_expires_at FROM guided_notes_export_attempts WHERE id = ?`).get(previewId) as ExportAttemptRow | undefined;
  if (!attempt || attempt.activity_id !== activityId || attempt.created_by_session_id !== sessionId) throw new HttpError(404, 'PREVIEW_NOT_FOUND', '找不到此匯出預覽，請重新建立預覽。');
  if (attempt.status !== 'previewed') throw new HttpError(409, 'PREVIEW_ALREADY_USED', '此預覽已確認或失效，請重新建立預覽。');
  if (Date.parse(attempt.preview_expires_at) <= Date.now()) throw new HttpError(409, 'PREVIEW_EXPIRED', '預覽已過期，請重新建立預覽。');

  const source = getGuidedNotesSource(db, activityId);
  if (!source || source.structureFingerprint !== attempt.source_fingerprint) throw new HttpError(409, 'SOURCE_CHANGED', '講義對應已變更，請重新匯入並建立新預覽。');
  let grid: SheetsWorksheetGrid;
  try { grid = await sheets.readWorksheet(source.spreadsheetId, source.sheetId); }
  catch (error) { return safeProviderFailure(error); }

  const questions = listActivityQuestions(db, activityId);
  let layout;
  try { layout = detectGuidedNotesLayout(grid); }
  catch (error) {
    if (error instanceof LayoutRecognitionError && error.code === 'BLANK_NOT_FOUND') {
      const occupied = listGuidedNotesMappings(db, source.id).some((mapping) => currentCellValue(grid.cells, mapping.rowIndex, mapping.columnIndex) !== null);
      if (occupied) throw new HttpError(409, 'TARGET_NO_LONGER_BLANK', '一個或多個填答格已被填入內容，為避免覆寫請重新檢查講義。');
      throw new HttpError(409, 'SOURCE_CHANGED', '講義填答位置已變更，請重新匯入並建立新預覽。');
    }
    if (error instanceof LayoutRecognitionError) throw new HttpError(422, error.code, error.message);
    throw error;
  }
  if (layout.structureFingerprint !== attempt.source_fingerprint) throw new HttpError(409, 'SOURCE_CHANGED', '講義題目或填答位置已變更，請重新匯入並建立新預覽。');

  let answerResults;
  try { answerResults = await answers.getResults(activityId); }
  catch { throw new HttpError(502, 'ANSWER_PROVIDER_UNAVAILABLE', '目前無法重新確認成功組別與答案，請稍後重試。'); }
  const answerHash = computeAnswerSnapshotHash(questions, answerResults);
  if (answerHash !== attempt.answer_snapshot_hash) throw new HttpError(409, 'ANSWERS_CHANGED', '預覽後作答結果已有變更，請重新建立預覽。');
  const resultByQuestion = validateAnswerResults(questions, answerResults);
  const storedMappings = listGuidedNotesMappings(db, source.id);
  const updates: SheetsCellUpdate[] = [];
  const unchanged: number[] = [];
  const failed: number[] = [];

  for (const question of layout.questions) {
    const questionMappings = storedMappings.filter((mapping) => mapping.questionNumber === question.questionNumber).sort((a, b) => a.slotOrder - b.slotOrder);
    if (questionMappings.length !== question.blanks.length || questionMappings.some((mapping, index) =>
      mapping.slotOrder !== question.blanks[index].slotOrder || mapping.rowIndex !== question.blanks[index].rowIndex
      || mapping.columnIndex !== question.blanks[index].columnIndex || mapping.blankKind !== question.blanks[index].blankKind)) {
      throw new HttpError(409, 'SOURCE_CHANGED', '講義填答位置與預覽時不同，請重新匯入並建立新預覽。');
    }
    const answer = resultByQuestion.get(question.questionNumber)!;
    if (!answer.winner) { unchanged.push(question.questionNumber); continue; }
    if (answer.answerParts.length !== question.blanks.length) { failed.push(question.questionNumber); continue; }
    for (const [index, blank] of question.blanks.entries()) {
      updates.push({ sheetId: source.sheetId, rowIndex: blank.rowIndex, columnIndex: blank.columnIndex, value: answer.answerParts[index] });
    }
  }

  const writableQuestions = [...new Set(updates.map((update) => layout.questions.find((question) => question.blanks.some((blank) => blank.rowIndex === update.rowIndex && blank.columnIndex === update.columnIndex))!.questionNumber))];
  setAttempt(db, previewId, 'pending', [], unchanged, failed);
  if (updates.length === 0) {
    setAttempt(db, previewId, 'completed', [], unchanged, failed);
    return resultFor(previewId, 'completed', [], unchanged, failed);
  }

  try {
    await sheets.writeCellUpdates(source.spreadsheetId, updates);
  } catch (error) {
    if (!(error instanceof SheetsGatewayError) || error.code !== 'UNAVAILABLE') {
      setAttempt(db, previewId, 'failed', [], unchanged, [...failed, ...writableQuestions]);
      return safeProviderFailure(error);
    }
    try { grid = await sheets.readWorksheet(source.spreadsheetId, source.sheetId); }
    catch {
      setAttempt(db, previewId, 'unknown', [], unchanged, [...failed, ...writableQuestions]);
      throw new HttpError(503, 'EXPORT_OUTCOME_UNKNOWN', '寫回結果目前無法確認，請檢查原講義後再處理。', { exportId: previewId });
    }
    const applied = updates.map((update) => currentCellValue(grid.cells, update.rowIndex, update.columnIndex) === update.value);
    if (applied.every(Boolean)) {
      setAttempt(db, previewId, 'completed', writableQuestions, unchanged, failed);
      return resultFor(previewId, 'completed', writableQuestions, unchanged, failed);
    }
    if (applied.every((value) => !value) && updates.every((update) => currentCellValue(grid.cells, update.rowIndex, update.columnIndex) === null)) {
      setAttempt(db, previewId, 'unknown', [], unchanged, [...failed, ...writableQuestions]);
      throw new HttpError(503, 'EXPORT_OUTCOME_UNKNOWN', 'Google Sheets 尚未確認寫回結果；請重新檢查講義，建立新預覽後再重試。', { exportId: previewId });
    }
    setAttempt(db, previewId, 'failed', [], unchanged, [...failed, ...writableQuestions]);
    return resultFor(previewId, 'failed', [], unchanged, [...failed, ...writableQuestions]);
  }

  try { grid = await sheets.readWorksheet(source.spreadsheetId, source.sheetId); }
  catch {
    setAttempt(db, previewId, 'unknown', [], unchanged, [...failed, ...writableQuestions]);
    throw new HttpError(503, 'EXPORT_OUTCOME_UNKNOWN', '寫回可能已送出，但目前無法驗證結果；請檢查原講義後再處理。', { exportId: previewId });
  }
  const verified = updates.every((update) => currentCellValue(grid.cells, update.rowIndex, update.columnIndex) === update.value);
  if (!verified) {
    setAttempt(db, previewId, 'failed', [], unchanged, [...failed, ...writableQuestions]);
    return resultFor(previewId, 'failed', [], unchanged, [...failed, ...writableQuestions]);
  }
  setAttempt(db, previewId, 'completed', writableQuestions, unchanged, failed);
  return resultFor(previewId, 'completed', writableQuestions, unchanged, failed);
}
