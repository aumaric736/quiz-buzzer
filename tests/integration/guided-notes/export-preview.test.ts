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

function gridFixture(): SheetsWorksheetGrid {
  return {
    sheetId: 7, title: '學習單', rowCount: 6, columnCount: 4,
    cells: [
      { rowIndex: 0, columnIndex: 0, enteredValue: '題號' },
      { rowIndex: 0, columnIndex: 1, enteredValue: '題目' },
      { rowIndex: 0, columnIndex: 2, enteredValue: '作答' },
      { rowIndex: 1, columnIndex: 0, enteredValue: 1 },
      { rowIndex: 1, columnIndex: 2, enteredValue: '(1)' },
      { rowIndex: 2, columnIndex: 2, enteredValue: '(2)' },
      { rowIndex: 4, columnIndex: 0, enteredValue: 2 }
    ],
    merges: [
      { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 },
      { startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 },
      { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
      { startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 },
      { startRowIndex: 4, endRowIndex: 5, startColumnIndex: 1, endColumnIndex: 2 },
      { startRowIndex: 4, endRowIndex: 5, startColumnIndex: 2, endColumnIndex: 4 }
    ]
  };
}

class FakeSheetsGateway implements SheetsGateway {
  grid = gridFixture();
  writes: SheetsCellUpdate[][] = [];
  async listWorksheets() { return [{ sheetId: 7, title: '學習單' }]; }
  async readWorksheet(_spreadsheetId: string, _sheetId: number) { return this.grid; }
  async writeCellUpdates(_spreadsheetId: string, updates: SheetsCellUpdate[]) { this.writes.push(updates); }
}

class FakeAnswerProvider implements WinningAnswerProvider {
  results: WinningAnswerResult[] = [
    { questionNumber: 1, winner: true, winningGroupId: 'group-1', winningGroupName: '藍隊', answerParts: ['答案甲', '答案乙'] },
    { questionNumber: 2, winner: false }
  ];
  calls = 0;
  async getResults() { this.calls++; return this.results; }
}

describe('Guided Notes export preview API', () => {
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
    app.use(express.json());
    app.use(guidedNotesRoutes(db, sheets, answers));
    app.use(errorMiddleware);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function requestPreview() {
    return fetch(`${baseUrl}/api/activities/${activityId}/guided-notes/export-previews`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId },
      body: '{}'
    });
  }

  it('previews ordered winner answers and a no-winner question without storing answer text or writing to Sheets', async () => {
    const response = await requestPreview();
    expect(response.status).toBe(201);
    const body = await response.json() as { previewId: string; items: Array<Record<string, unknown>> };
    expect(body.items).toMatchObject([
      { questionNumber: 1, winningGroupName: '藍隊', answerParts: ['答案甲', '答案乙'], blankCount: 2, status: 'ready' },
      { questionNumber: 2, status: 'no_winner', blankCount: 1 }
    ]);
    expect(body.previewId).toBeTruthy();
    expect(body.items[0]).toMatchObject({ targetLabels: ['第 1 題空格 1', '第 1 題空格 2'], occupiedTargetLabels: [] });
    expect(sheets.writes).toHaveLength(0);
    const persisted = db.prepare('SELECT status, answer_snapshot_hash FROM guided_notes_export_attempts WHERE id = ?').get(body.previewId) as { status: string; answer_snapshot_hash: string };
    expect(persisted.status).toBe('previewed');
    expect(persisted.answer_snapshot_hash).not.toContain('答案甲');
    expect(JSON.stringify(db.prepare('SELECT * FROM guided_notes_export_attempts').all())).not.toContain('答案乙');
    const expiry = db.prepare('SELECT preview_expires_at AS expiresAt, created_at AS createdAt FROM guided_notes_export_attempts WHERE id = ?').get(body.previewId) as { expiresAt: string; createdAt: string };
    expect(Date.parse(expiry.expiresAt) - Date.parse(expiry.createdAt)).toBe(5 * 60 * 1000);
  });

  it('shows occupied target labels, including cells with formulas and empty displayed values', async () => {
    sheets.grid.cells.push({ rowIndex: 1, columnIndex: 3, enteredValue: null, formula: '=IF(A1="","",A1)', formattedValue: '' });
    const response = await requestPreview();
    expect(response.status).toBe(201);
    const body = await response.json() as { items: Array<{ questionNumber: number; occupiedTargetLabels?: string[] }> };
    expect(body.items.find((item) => item.questionNumber === 1)?.occupiedTargetLabels).toEqual(['第 1 題空格 1']);
  });

  it('marks a per-question answer-part count mismatch without shifting answers to another slot', async () => {
    answers.results[0] = { questionNumber: 1, winner: true, winningGroupId: 'group-1', winningGroupName: '藍隊', answerParts: ['只有一段'] };
    const response = await requestPreview();
    expect(response.status).toBe(201);
    const body = await response.json() as { items: Array<Record<string, unknown>> };
    expect(body.items[0]).toMatchObject({ questionNumber: 1, blankCount: 2, status: 'part_count_mismatch' });
    expect(body.items[1]).toMatchObject({ questionNumber: 2, status: 'no_winner' });
    expect(sheets.writes).toHaveLength(0);
  });

  it('rejects previews until the activity has ended', async () => {
    db.prepare("UPDATE activities SET phase = '搶答進行中' WHERE id = ?").run(activityId);
    const response = await requestPreview();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'ACTIVITY_NOT_ENDED' });
    expect(answers.calls).toBe(0);
  });

  it('rejects a sheet whose structure changed after import and requires a fresh import', async () => {
    sheets.grid.merges.find((merge) => merge.startRowIndex === 4 && merge.startColumnIndex === 2)!.startColumnIndex = 3;
    const response = await requestPreview();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'SOURCE_CHANGED' });
    expect(db.prepare('SELECT COUNT(*) AS count FROM guided_notes_export_attempts').get()).toEqual({ count: 0 });
  });

  it('rejects incomplete answer-provider results instead of silently treating a missing question as no winner', async () => {
    answers.results = [answers.results[0]];
    const response = await requestPreview();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'ANSWER_RESULTS_INCOMPLETE' });
  });
});
