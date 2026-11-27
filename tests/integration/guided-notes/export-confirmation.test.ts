import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WinningAnswerProvider, WinningAnswerResult } from '@quiz-buzzer/shared';
import { errorMiddleware } from '../../../server/src/api/error-middleware.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { importGuidedNotes } from '../../../server/src/features/guided-notes/application/import-guided-notes.js';
import { guidedNotesRoutes } from '../../../server/src/features/guided-notes/api/guided-notes-routes.js';
import { SheetsGatewayError, type SheetsCellUpdate, type SheetsGateway, type SheetsWorksheetGrid } from '../../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';
import { openDatabase, type SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { groupSampleGrid, shiftSampleGrid, singleSlotSampleGrid } from '../../helpers/guided-notes-sample-grids.js';

class FakeSheetsGateway implements SheetsGateway {
  constructor(public grid: SheetsWorksheetGrid = groupSampleGrid()) {}
  writes: SheetsCellUpdate[][] = [];
  writeFailure: SheetsGatewayError | null = null;
  applyBeforeFailure = false;
  async listWorksheets() { return [{ sheetId: 7, title: '學習單' }]; }
  async readWorksheet(_spreadsheetId: string, _sheetId: number) { return this.grid; }
  async writeCellUpdates(_spreadsheetId: string, updates: SheetsCellUpdate[]) {
    this.writes.push(updates);
    if (this.applyBeforeFailure) this.apply(updates);
    if (this.writeFailure) throw this.writeFailure;
    this.apply(updates);
  }
  private apply(updates: SheetsCellUpdate[]) {
    for (const update of updates) {
      const cell = this.grid.cells.find((item) => item.rowIndex === update.rowIndex && item.columnIndex === update.columnIndex);
      if (cell) cell.enteredValue = update.value;
      else this.grid.cells.push({ rowIndex: update.rowIndex, columnIndex: update.columnIndex, enteredValue: update.value });
    }
  }
}

class FakeAnswerProvider implements WinningAnswerProvider {
  results: WinningAnswerResult[] = [
    { questionNumber: 1, winner: true, winningGroupId: 'group-1', winningGroupName: '藍隊', answerParts: ['答案甲', '答案乙'] },
    { questionNumber: 2, winner: false },
    { questionNumber: 3, winner: false },
    { questionNumber: 4, winner: false }
  ];
  async getResults() { return this.results; }
}

describe('Guided Notes export confirmation', () => {
  let db: SqliteDatabase;
  let server: Server;
  let sheets: FakeSheetsGateway;
  let answers: FakeAnswerProvider;
  let baseUrl: string;
  let sessionId: string;
  let activityId: string;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    sessionId = createSession(db, 'teacher').sessionId;
    activityId = createActivity(db, sessionId).activityId;
    sheets = new FakeSheetsGateway();
    answers = new FakeAnswerProvider();
    await importGuidedNotes(db, sheets, sessionId, activityId, { spreadsheetId: 'test-sheet-id', sheetId: 7 });
    db.prepare("UPDATE activities SET phase = '已結束' WHERE id = ?").run(activityId);
    const app = express();
    app.use(express.json()); app.use(guidedNotesRoutes(db, sheets, answers)); app.use(errorMiddleware);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function post(endpoint: string, body: unknown) {
    return fetch(`${baseUrl}/api/activities/${activityId}/guided-notes/${endpoint}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: JSON.stringify(body)
    });
  }
  async function createPreviewId(): Promise<string> {
    const preview = await post('export-previews', {});
    expect(preview.status).toBe(201);
    return (await preview.json() as { previewId: string }).previewId;
  }

  it('writes only ready dynamic targets and preserves a no-winner question', async () => {
    const previewId = await createPreviewId();
    const response = await post('exports', { previewId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'completed', writtenQuestionNumbers: [1], unchangedQuestionNumbers: [2, 3, 4], failedQuestionNumbers: [] });
    expect(sheets.writes).toHaveLength(1);
    expect(sheets.writes[0]).toEqual([
      { sheetId: 7, rowIndex: 4, columnIndex: 7, value: '小組：藍隊。回答：答案甲。' },
      { sheetId: 7, rowIndex: 5, columnIndex: 7, value: '小組：藍隊。回答：答案乙。' }
    ]);
    expect(sheets.grid.cells.find((cell) => cell.rowIndex === 4 && cell.columnIndex === 6)?.enteredValue).toBe('(1)');
    expect(sheets.grid.cells.find((cell) => cell.rowIndex === 12 && cell.columnIndex === 1)?.enteredValue).toBe(4);
  });

  it('skips a question with mismatched answer parts and does not shift them into another blank', async () => {
    answers.results[0] = { questionNumber: 1, winner: true, winningGroupId: 'group-1', winningGroupName: '藍隊', answerParts: ['只有一段'] };
    const previewId = await createPreviewId();
    const response = await post('exports', { previewId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'completed', writtenQuestionNumbers: [], unchangedQuestionNumbers: [2, 3, 4], failedQuestionNumbers: [1] });
    expect(sheets.writes).toHaveLength(0);
  });

  it('refuses to overwrite a target changed after preview', async () => {
    const previewId = await createPreviewId();
    sheets.grid.cells.push({ rowIndex: 4, columnIndex: 7, enteredValue: '外部變更' });
    const response = await post('exports', { previewId });
    expect(response.status).toBe(409);
    const body = await response.json() as { code: string; message: string };
    expect(body).toMatchObject({ code: 'TARGET_CELLS_OCCUPIED' });
    expect(body.message).toContain('第 1 題空格 1');
    expect(sheets.writes).toHaveLength(0);
  });

  it('reports write permission denial without claiming success and records the failed attempt', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const previewId = await createPreviewId();
    sheets.writeFailure = new SheetsGatewayError('WRITE_DENIED', 'raw private provider detail');
    const response = await post('exports', { previewId });
    expect(response.status).toBe(403);
    const body = await response.text();
    expect(body).toContain('SHEETS_WRITE_DENIED');
    expect(body).not.toContain('raw private provider detail');
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('raw private provider detail');
    expect(db.prepare('SELECT status FROM guided_notes_export_attempts WHERE id = ?').get(previewId)).toEqual({ status: 'failed' });
  });

  it('imports the second sample at shifted coordinates and writes only its dynamically detected target', async () => {
    activityId = createActivity(db, sessionId).activityId;
    sheets.grid = shiftSampleGrid(singleSlotSampleGrid(), 7, 3);
    await importGuidedNotes(db, sheets, sessionId, activityId, { spreadsheetId: 'second-test-sheet-id', sheetId: 7 });
    answers.results = [
      { questionNumber: 1, winner: true, winningGroupId: 'group-1', winningGroupName: '藍隊', answerParts: ['第一題答案'] },
      { questionNumber: 2, winner: false }, { questionNumber: 3, winner: false },
      { questionNumber: 4, winner: false }, { questionNumber: 5, winner: false }, { questionNumber: 6, winner: false }
    ];
    db.prepare("UPDATE activities SET phase = '已結束' WHERE id = ?").run(activityId);

    const previewId = await createPreviewId();
    const response = await post('exports', { previewId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'completed', writtenQuestionNumbers: [1], unchangedQuestionNumbers: [2, 3, 4, 5, 6] });
    expect(sheets.writes).toHaveLength(1);
    expect(sheets.writes[0]).toEqual([{ sheetId: 7, rowIndex: 11, columnIndex: 9, value: '小組：藍隊。回答：第一題答案。' }]);
    expect(sheets.grid.cells.find((cell) => cell.rowIndex === 11 && cell.columnIndex === 4)?.enteredValue).toBe(1);
    expect(sheets.grid.cells.find((cell) => cell.rowIndex === 13 && cell.columnIndex === 4)?.enteredValue).toBe(2);
  });

  it('previews every mapped target and rejects all writes when a formula target displays no value', async () => {
    sheets.grid.cells.push({ rowIndex: 5, columnIndex: 7, enteredValue: null, formula: '=IF(A1="","",A1)', formattedValue: '' });
    const previewResponse = await post('export-previews', {});
    expect(previewResponse.status).toBe(201);
    const preview = await previewResponse.json() as { previewId: string; items: Array<{ questionNumber: number; occupiedTargetLabels?: string[] }> };
    expect(preview.items.find((item) => item.questionNumber === 1)?.occupiedTargetLabels).toEqual(['第 1 題空格 2']);
    const response = await post('exports', { previewId: preview.previewId });
    expect(response.status).toBe(409);
    expect(await response.text()).toContain('第 1 題空格 2');
    expect(sheets.writes).toHaveLength(0);
  });

  it('allows a fresh preview after an earlier preview expires', async () => {
    const expiredId = await createPreviewId();
    db.prepare('UPDATE guided_notes_export_attempts SET preview_expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1).toISOString(), expiredId);
    const expired = await post('exports', { previewId: expiredId });
    expect(expired.status).toBe(409);
    expect(await expired.json()).toMatchObject({ code: 'PREVIEW_EXPIRED' });
    const refreshedId = await createPreviewId();
    expect(refreshedId).not.toBe(expiredId);
  });
});
