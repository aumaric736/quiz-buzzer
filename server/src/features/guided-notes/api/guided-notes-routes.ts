import { Router, type Request } from 'express';
import type { WinningAnswerProvider } from '@quiz-buzzer/shared';
import { HttpError, isRecord, requireNonEmptyString } from '../../../api/validation.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { discoverGuidedNotesWorksheets, importGuidedNotes } from '../application/import-guided-notes.js';
import { buildExportPreview } from '../application/build-export-preview.js';
import { confirmGuidedNotesExport } from '../application/confirm-guided-notes-export.js';
import { getExportAttemptResult } from '../persistence/export-attempt-repository.js';
import { retryGuidedNotesExport } from '../application/export-retry-service.js';
import type { SheetsGateway } from '../google-sheets/sheets-gateway.js';

function requestSessionId(request: Request): string {
  const value = request.header('X-Local-Session-Id');
  if (!value || value.length > 100) throw new HttpError(400, 'SESSION_REQUIRED', '請先選擇老師工作階段。');
  return value;
}

export function guidedNotesRoutes(db: SqliteDatabase, gateway: SheetsGateway, answerProvider?: WinningAnswerProvider): Router {
  const router = Router();

  router.post('/api/activities/:activityId/guided-notes/worksheets', async (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 1 || !('spreadsheetUrl' in request.body)) {
        throw new HttpError(400, 'INVALID_REQUEST_BODY', '請提供一個 Google Sheets 網址。');
      }
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const result = await discoverGuidedNotesWorksheets(db, gateway, requestSessionId(request), activityId, request.body.spreadsheetUrl);
      response.json(result);
    } catch (error) { next(error); }
  });

  router.post('/api/activities/:activityId/guided-notes/import', async (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 2 || !('spreadsheetId' in request.body) || !('sheetId' in request.body)) {
        throw new HttpError(400, 'INVALID_REQUEST_BODY', '請提供 Google Sheets 文件 ID 與工作表 ID。');
      }
      if (typeof request.body.sheetId !== 'number') throw new HttpError(400, 'INVALID_WORKSHEET_ID', '工作表 ID 必須是非負整數。');
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const input = {
        spreadsheetId: requireNonEmptyString(request.body.spreadsheetId, 'spreadsheetId', 2048),
        sheetId: request.body.sheetId
      };
      const result = await importGuidedNotes(db, gateway, requestSessionId(request), activityId, input);
      response.status(201).json(result);
    } catch (error) { next(error); }
  });

  router.post('/api/activities/:activityId/guided-notes/export-previews', async (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 0) {
        throw new HttpError(400, 'INVALID_REQUEST_BODY', '建立匯出預覽不需要額外欄位。');
      }
      if (!answerProvider) {
        throw new HttpError(503, 'ANSWER_PROVIDER_UNAVAILABLE', '作答子功能尚未提供匯出所需的成功組別與答案資料。');
      }
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const preview = await buildExportPreview(db, gateway, answerProvider, requestSessionId(request), activityId);
      response.status(201).json(preview);
    } catch (error) { next(error); }
  });

  router.post('/api/activities/:activityId/guided-notes/exports', async (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 1 || !('previewId' in request.body)) {
        throw new HttpError(400, 'INVALID_REQUEST_BODY', '請提供要確認的匯出預覽 ID。');
      }
      if (typeof request.body.previewId !== 'string' || !request.body.previewId.trim() || request.body.previewId.length > 100) {
        throw new HttpError(400, 'INVALID_PREVIEW_ID', '匯出預覽 ID 格式不正確。');
      }
      if (!answerProvider) throw new HttpError(503, 'ANSWER_PROVIDER_UNAVAILABLE', '作答子功能尚未提供匯出所需的成功組別與答案資料。');
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const result = await confirmGuidedNotesExport(db, gateway, answerProvider, requestSessionId(request), activityId, request.body.previewId);
      response.json(result);
    } catch (error) { next(error); }
  });

  router.get('/api/activities/:activityId/guided-notes/exports/:exportId', (request, response, next) => {
    try {
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const exportId = requireNonEmptyString(request.params.exportId, 'exportId', 100);
      response.json(getExportAttemptResult(db, requestSessionId(request), activityId, exportId));
    } catch (error) { next(error); }
  });

  router.post('/api/activities/:activityId/guided-notes/exports/:exportId/retry', async (request, response, next) => {
    try {
      if (!isRecord(request.body) || Object.keys(request.body).length !== 0) throw new HttpError(400, 'INVALID_REQUEST_BODY', '安全重試不需要額外欄位。');
      if (!answerProvider) throw new HttpError(503, 'ANSWER_PROVIDER_UNAVAILABLE', '作答子功能尚未提供最終答案資料。');
      const activityId = requireNonEmptyString(request.params.activityId, 'activityId', 100);
      const exportId = requireNonEmptyString(request.params.exportId, 'exportId', 100);
      response.json(await retryGuidedNotesExport(db, gateway, answerProvider, requestSessionId(request), activityId, exportId));
    } catch (error) { next(error); }
  });

  return router;
}
