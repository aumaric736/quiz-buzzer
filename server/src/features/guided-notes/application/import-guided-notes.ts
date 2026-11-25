import { HttpError } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import type { GuidedNotesImportRequest, GuidedNotesImportResponse, GuidedNotesWorksheet } from '@quiz-buzzer/shared';
import { detectGuidedNotesLayout, LayoutRecognitionError } from '../domain/layout-recognizer.js';
import { saveGuidedNotesImport } from '../persistence/guided-notes-repository.js';
import { SheetsGatewayError, type SheetsGateway } from '../google-sheets/sheets-gateway.js';
import { requireActiveSession } from '../../user-stage-sync/application/session-service.js';

function requireTeacherActivity(db: SqliteDatabase, sessionId: string, activityId: string): void {
  requireActiveSession(db, sessionId);
  const session = db.prepare('SELECT role FROM user_sessions WHERE id = ?').get(sessionId) as { role: string } | undefined;
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', '找不到本機工作階段，請重新選擇角色。');
  if (session.role !== 'teacher') throw new HttpError(403, 'TEACHER_REQUIRED', '只有老師可以匯入 Guided Notes。');
  const activity = db.prepare('SELECT created_by_session_id FROM activities WHERE id = ?').get(activityId) as { created_by_session_id: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (activity.created_by_session_id !== sessionId) throw new HttpError(403, 'ACTIVITY_OWNER_REQUIRED', '只有建立此活動的老師可以匯入 Guided Notes。');
}

function requirePreparationPhase(db: SqliteDatabase, activityId: string): void {
  const activity = db.prepare('SELECT phase FROM activities WHERE id = ?').get(activityId) as { phase: string } | undefined;
  if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
  if (activity.phase !== '準備中') {
    throw new HttpError(409, 'GUIDED_NOTES_IMPORT_LOCKED', '搶答開始後無法更換 Guided Notes；請在準備階段完成講義匯入。');
  }
}

export function parseSpreadsheetId(input: unknown): string {
  if (typeof input !== 'string' || input.trim().length === 0 || input.trim().length > 2048) {
    throw new HttpError(400, 'INVALID_SPREADSHEET_ID', '請提供有效的 Google Sheets 網址或文件 ID。');
  }
  const value = input.trim();
  if (!value.includes('://')) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(value)) throw new HttpError(400, 'INVALID_SPREADSHEET_ID', 'Google Sheets 文件 ID 格式不正確。');
    return value;
  }
  let url: URL;
  try { url = new URL(value); } catch { throw new HttpError(400, 'INVALID_SPREADSHEET_ID', 'Google Sheets 網址格式不正確。'); }
  const match = /^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/.exec(url.pathname);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !match) {
    throw new HttpError(400, 'INVALID_SPREADSHEET_ID', '僅接受有效的 docs.google.com/spreadsheets 文件網址。');
  }
  return match[1];
}

function mapSheetsError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof SheetsGatewayError) {
    const mapping: Record<SheetsGatewayError['code'], { status: number; code: string; message: string }> = {
      ACCESS_DENIED: { status: 403, code: 'SHEETS_ACCESS_DENIED', message: '無法讀取講義；請將文件分享給設定的服務帳戶並確認讀取權限。' },
      WRITE_DENIED: { status: 403, code: 'SHEETS_WRITE_DENIED', message: '服務帳戶沒有講義編輯權限，請分享文件並授予編輯者權限。' },
      NOT_FOUND: { status: 404, code: 'WORKSHEET_NOT_FOUND', message: '找不到此 Google Sheets 文件或工作表，請重新確認選擇。' },
      UNAVAILABLE: { status: 502, code: 'SHEETS_UNAVAILABLE', message: 'Google Sheets 暫時無法存取，請稍後再試。' },
      NOT_CONFIGURED: { status: 503, code: 'SHEETS_NOT_CONFIGURED', message: '伺服器尚未設定 Google Sheets 服務帳戶，請設定服務帳戶環境變數。' }
    };
    const mapped = mapping[error.code];
    throw new HttpError(mapped.status, mapped.code, mapped.message);
  }
  if (error instanceof LayoutRecognitionError) {
    throw new HttpError(422, error.code, error.message);
  }
  throw error;
}

export async function discoverGuidedNotesWorksheets(
  db: SqliteDatabase,
  gateway: SheetsGateway,
  sessionId: string,
  activityId: string,
  spreadsheetInput: unknown
): Promise<{ spreadsheetId: string; worksheets: GuidedNotesWorksheet[] }> {
  requireTeacherActivity(db, sessionId, activityId);
  const spreadsheetId = parseSpreadsheetId(spreadsheetInput);
  try {
    const worksheets = await gateway.listWorksheets(spreadsheetId);
    return { spreadsheetId, worksheets };
  } catch (error) { return mapSheetsError(error); }
}

export async function importGuidedNotes(
  db: SqliteDatabase,
  gateway: SheetsGateway,
  sessionId: string,
  activityId: string,
  request: GuidedNotesImportRequest
): Promise<GuidedNotesImportResponse> {
  requireTeacherActivity(db, sessionId, activityId);
  requirePreparationPhase(db, activityId);
  const spreadsheetId = parseSpreadsheetId(request.spreadsheetId);
  if (!Number.isSafeInteger(request.sheetId) || request.sheetId < 0) throw new HttpError(400, 'INVALID_WORKSHEET_ID', '請選擇有效的工作表。');
  try {
    const grid = await gateway.readWorksheet(spreadsheetId, request.sheetId);
    if (grid.sheetId !== request.sheetId) throw new HttpError(404, 'WORKSHEET_NOT_FOUND', '找不到指定的工作表，請重新選擇工作表。');
    const layout = detectGuidedNotesLayout(grid);
    return saveGuidedNotesImport(db, {
      activityId,
      spreadsheetId,
      sheetId: request.sheetId,
      sheetTitle: grid.title,
      layout
    });
  } catch (error) { return mapSheetsError(error); }
}
