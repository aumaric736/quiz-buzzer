import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WinningAnswerProvider, WinningAnswerResult } from '@quiz-buzzer/shared';
import { errorMiddleware } from '../../../server/src/api/error-middleware.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { importGuidedNotes } from '../../../server/src/features/guided-notes/application/import-guided-notes.js';
import { guidedNotesRoutes } from '../../../server/src/features/guided-notes/api/guided-notes-routes.js';
import { SheetsGatewayError, type SheetsCellUpdate, type SheetsGateway, type SheetsWorksheetGrid } from '../../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';
import { openDatabase, type SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { guidedNotesGridFixture } from '../../helpers/guided-notes-grid.js';

type FailureMode = 'none-applied' | 'all-applied' | 'mixed';

class UncertainSheetsGateway implements SheetsGateway {
  grid = guidedNotesGridFixture();
  calls = 0;
  mode: FailureMode = 'none-applied';
  async listWorksheets() { return [{ sheetId: 7, title: '學習單' }]; }
  async readWorksheet(_spreadsheetId: string, _sheetId: number) { return this.grid; }
  async writeCellUpdates(_spreadsheetId: string, updates: SheetsCellUpdate[]) {
    this.calls++;
    const count = this.mode === 'all-applied' ? updates.length : this.mode === 'mixed' ? 1 : 0;
    for (const update of updates.slice(0, count)) {
      const cell = this.grid.cells.find((item) => item.rowIndex === update.rowIndex && item.columnIndex === update.columnIndex);
      if (cell) cell.enteredValue = update.value;
      else this.grid.cells.push({ rowIndex: update.rowIndex, columnIndex: update.columnIndex, enteredValue: update.value });
    }
    throw new SheetsGatewayError('UNAVAILABLE', 'response lost after remote submission');
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

describe('Guided Notes uncertain export reconciliation', () => {
  let db: SqliteDatabase;
  let server: Server;
  let sheets: UncertainSheetsGateway;
  let baseUrl: string;
  let sessionId: string;
  let activityId: string;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    sessionId = createSession(db, 'teacher').sessionId;
    activityId = createActivity(db, sessionId).activityId;
    sheets = new UncertainSheetsGateway();
    await importGuidedNotes(db, sheets, sessionId, activityId, { spreadsheetId: 'test-sheet-id', sheetId: 7 });
    db.prepare("UPDATE activities SET phase = '已結束' WHERE id = ?").run(activityId);
    const app = express(); app.use(express.json()); app.use(guidedNotesRoutes(db, sheets, new FakeAnswerProvider())); app.use(errorMiddleware);
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
  async function makePreview() {
    const response = await post('export-previews', {});
    return (await response.json() as { previewId: string }).previewId;
  }

  it('confirms success by rereading targets when the batch applied but its response was lost', async () => {
    sheets.mode = 'all-applied';
    const previewId = await makePreview();
    const response = await post('exports', { previewId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'completed', writtenQuestionNumbers: [1] });
    expect(db.prepare('SELECT status FROM guided_notes_export_attempts WHERE id = ?').get(previewId)).toEqual({ status: 'completed' });
    expect(sheets.calls).toBe(1);
  });

  it('keeps the result unknown and never automatically retries when the batch applied no targets', async () => {
    sheets.mode = 'none-applied';
    const previewId = await makePreview();
    const response = await post('exports', { previewId });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'EXPORT_OUTCOME_UNKNOWN', exportId: previewId });
    expect(db.prepare('SELECT status FROM guided_notes_export_attempts WHERE id = ?').get(previewId)).toEqual({ status: 'unknown' });
    expect(sheets.calls).toBe(1);
  });

  it('safely retries an unknown attempt only after building and confirming a fresh worksheet preview', async () => {
    sheets.mode = 'none-applied';
    const originalId = await makePreview();
    const first = await post('exports', { previewId: originalId });
    expect(first.status).toBe(503);
    sheets.mode = 'all-applied';
    const retry = await post(`exports/${originalId}/retry`, {});
    expect(retry.status).toBe(200);
    const result = await retry.json() as { exportId: string; status: string; writtenQuestionNumbers: number[] };
    expect(result).toMatchObject({ status: 'completed', writtenQuestionNumbers: [1] });
    expect(result.exportId).not.toBe(originalId);
    expect(db.prepare('SELECT status FROM guided_notes_export_attempts WHERE id = ?').get(originalId)).toEqual({ status: 'unknown' });
    expect(db.prepare('SELECT status FROM guided_notes_export_attempts WHERE id = ?').get(result.exportId)).toEqual({ status: 'completed' });
    expect(sheets.calls).toBe(2);
  });

  it('reports mixed target values for teacher review and does not retry the batch', async () => {
    sheets.mode = 'mixed';
    const previewId = await makePreview();
    const response = await post('exports', { previewId });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'failed', writtenQuestionNumbers: [], failedQuestionNumbers: [1] });
    expect(db.prepare('SELECT status FROM guided_notes_export_attempts WHERE id = ?').get(previewId)).toEqual({ status: 'failed' });
    expect(sheets.calls).toBe(1);
  });
});
