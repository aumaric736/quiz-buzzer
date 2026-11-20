import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WinningAnswerProvider, WinningAnswerResult } from '@quiz-buzzer/shared';
import { errorMiddleware } from '../../../server/src/api/error-middleware.js';
import { createApp } from '../../../server/src/app.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { importGuidedNotes } from '../../../server/src/features/guided-notes/application/import-guided-notes.js';
import type { SheetsCellUpdate, SheetsGateway, SheetsWorksheetGrid } from '../../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';
import { openDatabase, type SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { guidedNotesGridFixture } from '../../helpers/guided-notes-grid.js';

class FakeSheetsGateway implements SheetsGateway {
  grid = guidedNotesGridFixture();
  writes: SheetsCellUpdate[][] = [];
  async listWorksheets() { return [{ sheetId: 7, title: '學習單' }]; }
  async readWorksheet(_spreadsheetId: string, _sheetId: number): Promise<SheetsWorksheetGrid> { return this.grid; }
  async writeCellUpdates(_spreadsheetId: string, updates: SheetsCellUpdate[]) {
    this.writes.push(updates);
    for (const update of updates) {
      const cell = this.grid.cells.find((item) => item.rowIndex === update.rowIndex && item.columnIndex === update.columnIndex);
      if (cell) cell.enteredValue = update.value;
      else this.grid.cells.push({ rowIndex: update.rowIndex, columnIndex: update.columnIndex, enteredValue: update.value });
    }
  }
}

class FakeAnswerProvider implements WinningAnswerProvider {
  async getResults(): Promise<WinningAnswerResult[]> {
    return [
      { questionNumber: 1, winner: true, winningGroupId: 'group-1', winningGroupName: '藍隊', answerParts: ['答案甲', '答案乙'] },
      { questionNumber: 2, winner: false }
    ];
  }
}

describe('Guided Notes app composition', () => {
  let db: SqliteDatabase;
  let sheets: FakeSheetsGateway;
  let sessionId: string;
  let activityId: string;
  let server: Server | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    sessionId = createSession(db, 'teacher').sessionId;
    activityId = createActivity(db, sessionId).activityId;
    sheets = new FakeSheetsGateway();
    await importGuidedNotes(db, sheets, sessionId, activityId, { spreadsheetId: 'test-sheet-id', sheetId: 7 });
    db.prepare("UPDATE activities SET phase = '已結束' WHERE id = ?").run(activityId);
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    server = undefined;
    db.close();
  });

  async function startApp(withDependencies: boolean) {
    const dependencies = withDependencies ? { sheetsGateway: sheets, winningAnswerProvider: new FakeAnswerProvider() } : undefined;
    const app = createApp(db, 'http://127.0.0.1:5173', undefined, dependencies);
    app.use(errorMiddleware);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  async function request(path: string, method: 'GET' | 'POST' = 'POST', body?: unknown) {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'X-Local-Session-Id': sessionId, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  }

  it('uses the persisted answer provider by default and reports unavailable Sheets access clearly', async () => {
    await startApp(false);
    const response = await request(`/api/activities/${activityId}/guided-notes/export-previews`, 'POST', {});
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'SHEETS_NOT_CONFIGURED' });
  });

  it('uses injected production-boundary dependencies through createApp for preview and confirmed write', async () => {
    await startApp(true);
    const previewResponse = await request(`/api/activities/${activityId}/guided-notes/export-previews`, 'POST', {});
    expect(previewResponse.status).toBe(201);
    const preview = await previewResponse.json() as { previewId: string };

    const exportResponse = await request(`/api/activities/${activityId}/guided-notes/exports`, 'POST', { previewId: preview.previewId });
    expect(exportResponse.status).toBe(200);
    expect(await exportResponse.json()).toMatchObject({ status: 'completed', writtenQuestionNumbers: [1], unchangedQuestionNumbers: [2] });
    expect(sheets.writes).toEqual([[
      { sheetId: 7, rowIndex: 1, columnIndex: 3, value: '答案甲' },
      { sheetId: 7, rowIndex: 2, columnIndex: 3, value: '答案乙' }
    ]]);
  });
});
