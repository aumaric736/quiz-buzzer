import { createHash, randomUUID } from 'node:crypto';
import type { GuidedNotesExportPreview, GuidedNotesExportPreviewItem, WinningAnswerProvider, WinningAnswerResult } from '@quiz-buzzer/shared';
import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { detectGuidedNotesLayout, LayoutRecognitionError } from '../domain/layout-recognizer.js';
import { getGuidedNotesSource, listActivityQuestions, listGuidedNotesMappings } from '../persistence/guided-notes-repository.js';
import { SheetsGatewayError, type SheetsGateway } from '../google-sheets/sheets-gateway.js';
import { requireActiveSession } from '../../user-stage-sync/application/session-service.js';

const PREVIEW_LIFETIME_MS = 15 * 60 * 1000;

function requireTeacherForEndedActivity(db: SqliteDatabase, sessionId: string, activityId: string): void {
  requireActiveSession(db, sessionId);
  const session = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  if (session.role !== 'teacher') throw new HttpError(403, 'TEACHER_REQUIRED', '只有老師可以準備 Guided Notes 匯出。');
  const activity = db.prepare('SELECT created_by_session_id, phase FROM activities WHERE id = ?').get(activityId) as
    | { created_by_session_id: string; phase: string }
    | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (activity.created_by_session_id !== sessionId) throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有建立此活動的老師可以匯出 Guided Notes。');
  if (activity.phase !== '已結束') throw new HttpError(409, 'ACTIVITY_NOT_ENDED', '請先結束活動，再建立答案匯出預覽。');
}

function mapProviderError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof SheetsGatewayError) {
    const status = error.code === 'ACCESS_DENIED' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'NOT_CONFIGURED' ? 503 : 502;
    const code = error.code === 'ACCESS_DENIED' ? 'SHEETS_ACCESS_DENIED'
      : error.code === 'NOT_FOUND' ? 'WORKSHEET_NOT_FOUND'
        : error.code === 'NOT_CONFIGURED' ? 'SHEETS_NOT_CONFIGURED' : 'SHEETS_UNAVAILABLE';
    const message = error.code === 'ACCESS_DENIED' ? '無法讀取原講義，請確認服務帳戶仍有文件存取權。'
      : error.code === 'NOT_FOUND' ? '找不到原講義或工作表，請重新匯入。'
        : error.code === 'NOT_CONFIGURED' ? '伺服器尚未設定 Google Sheets 服務帳戶環境變數。'
          : 'Google Sheets 暫時無法存取，請稍後再試。';
    throw new HttpError(status, code, message);
  }
  if (error instanceof LayoutRecognitionError) throw new HttpError(422, error.code, error.message);
  throw new HttpError(502, 'ANSWER_PROVIDER_UNAVAILABLE', '目前無法取得每題成功組別與答案，請確認作答子功能已提供資料後重試。');
}

export function validateAnswerResults(questionNumbers: number[], results: WinningAnswerResult[]): Map<number, WinningAnswerResult> {
  if (!Array.isArray(results)) throw new HttpError(502, 'ANSWER_RESULTS_INVALID', '作答子功能回傳的答案資料格式不正確。');
  const knownQuestions = new Set(questionNumbers);
  const byQuestion = new Map<number, WinningAnswerResult>();
  for (const result of results) {
    if (!result || !Number.isSafeInteger(result.questionNumber) || !knownQuestions.has(result.questionNumber) || byQuestion.has(result.questionNumber)) {
      throw new HttpError(502, 'ANSWER_RESULTS_INVALID', '作答子功能回傳了未知或重複的題號，無法安全建立預覽。');
    }
    if (result.winner && (!result.winningGroupId.trim() || !result.winningGroupName.trim() || result.answerParts.some((part) => typeof part !== 'string' || part.trim().length === 0))) {
      throw new HttpError(502, 'ANSWER_RESULTS_INVALID', '作答子功能回傳的組別或答案片段不完整，無法建立預覽。');
    }
    byQuestion.set(result.questionNumber, result);
  }
  if (byQuestion.size !== questionNumbers.length) {
    throw new HttpError(502, 'ANSWER_RESULTS_INCOMPLETE', '作答子功能尚未提供所有題目的成功作答結果，請稍後重試。');
  }
  return byQuestion;
}

export function computeAnswerSnapshotHash(questionNumbers: number[], results: WinningAnswerResult[]): string {
  const byQuestion = validateAnswerResults(questionNumbers, results);
  const orderedResults = [...questionNumbers].sort((a, b) => a - b).map((questionNumber) => byQuestion.get(questionNumber)!);
  return createHash('sha256').update(JSON.stringify(orderedResults)).digest('hex');
}

export async function buildExportPreview(
  db: SqliteDatabase,
  sheets: SheetsGateway,
  answers: WinningAnswerProvider,
  sessionId: string,
  activityId: string
): Promise<GuidedNotesExportPreview> {
  requireTeacherForEndedActivity(db, sessionId, activityId);
  const source = getGuidedNotesSource(db, activityId);
  if (!source) throw new HttpError(409, 'GUIDED_NOTES_NOT_IMPORTED', '請先匯入此活動的 Guided Notes。');

  let grid;
  let answerResults: WinningAnswerResult[];
  try {
    grid = await sheets.readWorksheet(source.spreadsheetId, source.sheetId);
  } catch (error) { return mapProviderError(error); }

  const storedQuestions = listActivityQuestions(db, activityId);
  const storedMappings = listGuidedNotesMappings(db, source.id);
  if (storedMappings.length === 0) throw new HttpError(409, 'GUIDED_NOTES_NOT_IMPORTED', '此講義沒有有效的填答位置，請重新匯入。');
  const layout = detectGuidedNotesLayout(grid);
  if (layout.structureFingerprint !== source.structureFingerprint) {
    throw new HttpError(409, 'SOURCE_CHANGED', '匯入後講義題目或填答位置已變更，請重新匯入並檢查新對應後再建立預覽。');
  }
  const currentQuestionNumbers = layout.questions.map(({ questionNumber }) => questionNumber).sort((a, b) => a - b);
  if (currentQuestionNumbers.length !== storedQuestions.length || currentQuestionNumbers.some((number, index) => number !== storedQuestions[index])) {
    throw new HttpError(409, 'SOURCE_CHANGED', '講義題號與活動題目清單已不一致，請重新匯入並檢查新對應。');
  }

  try { answerResults = await answers.getResults(activityId); }
  catch { throw new HttpError(502, 'ANSWER_PROVIDER_UNAVAILABLE', '目前無法取得每題成功組別與答案，請稍後重試。'); }
  const resultByQuestion = validateAnswerResults(storedQuestions, answerResults);
  const mappingCounts = new Map<number, number>();
  for (const mapping of storedMappings) mappingCounts.set(mapping.questionNumber, (mappingCounts.get(mapping.questionNumber) ?? 0) + 1);

  const items: GuidedNotesExportPreviewItem[] = layout.questions.map(({ questionNumber, blanks }) => {
    const result = resultByQuestion.get(questionNumber)!;
    const blankCount = mappingCounts.get(questionNumber) ?? 0;
    if (blankCount !== blanks.length) throw new HttpError(409, 'SOURCE_CHANGED', '講義填答位置與已匯入對應不一致，請重新匯入。');
    const targetLabels = blanks.map((blank) => `第 ${questionNumber} 題空格 ${blank.slotOrder + 1}`);
    if (!result.winner) return { questionNumber, status: 'no_winner', blankCount, targetLabels };
    return {
      questionNumber,
      status: result.answerParts.length === blankCount ? 'ready' : 'part_count_mismatch',
      winningGroupName: result.winningGroupName,
      answerParts: result.answerParts,
      blankCount,
      targetLabels
    };
  });

  const answerSnapshotHash = computeAnswerSnapshotHash(storedQuestions, answerResults);
  const previewId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PREVIEW_LIFETIME_MS).toISOString();
  db.prepare(`INSERT INTO guided_notes_export_attempts
    (id, activity_id, created_by_session_id, status, source_fingerprint, answer_snapshot_hash,
     preview_expires_at, created_at, updated_at)
    VALUES (?, ?, ?, 'previewed', ?, ?, ?, ?, ?)`)
    .run(previewId, activityId, sessionId, source.structureFingerprint, answerSnapshotHash, expiresAt, now.toISOString(), now.toISOString());

  return { previewId, activityId, phase: '已結束', items, expiresAt };
}
