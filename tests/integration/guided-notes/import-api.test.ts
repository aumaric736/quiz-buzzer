import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorMiddleware } from '../../../server/src/api/error-middleware.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { guidedNotesRoutes } from '../../../server/src/features/guided-notes/api/guided-notes-routes.js';
import { SheetsGatewayError, type SheetsGateway, type SheetsWorksheetGrid } from '../../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';
import { openDatabase, type SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';

function fixtureGrid(): SheetsWorksheetGrid {
  return {
    sheetId: 7,
    title: '學習單',
    rowCount: 4,
    columnCount: 3,
    cells: [
      { rowIndex: 0, columnIndex: 0, enteredValue: '題號' },
      { rowIndex: 0, columnIndex: 1, enteredValue: '題目' },
      { rowIndex: 0, columnIndex: 2, enteredValue: '作答' },
      { rowIndex: 1, columnIndex: 0, enteredValue: 1 }
    ],
    merges: [
      { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 },
      { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 2 },
      { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 2, endColumnIndex: 3 }
    ]
  };
}

class FakeSheetsGateway implements SheetsGateway {
  accessDenied = false;
  listCalls = 0;
  async listWorksheets() {
    this.listCalls++;
    if (this.accessDenied) throw new SheetsGatewayError('ACCESS_DENIED', 'remote private details');
    return [{ sheetId: 7, title: '學習單' }];
  }
  async readWorksheet(_spreadsheetId: string, sheetId: number) {
    if (sheetId !== 7) throw new SheetsGatewayError('NOT_FOUND', 'remote details');
    return fixtureGrid();
  }
  async writeCellUpdates() { throw new Error('Import must never write to Google Sheets.'); }
}

describe('Guided Notes import API', () => {
  let db: SqliteDatabase;
  let server: Server;
  let gateway: FakeSheetsGateway;
  let baseUrl: string;
  let teacherId: string;
  let activityId: string;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    const teacher = createSession(db, 'teacher');
    teacherId = teacher.sessionId;
    activityId = createActivity(db, teacherId).activityId;
    gateway = new FakeSheetsGateway();
    const app = express();
    app.use(express.json());
    app.use(guidedNotesRoutes(db, gateway));
    app.use(errorMiddleware);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function post(path: string, body: unknown, sessionId = teacherId) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId },
      body: JSON.stringify(body)
    });
  }

  it('discovers worksheets and imports recognized question and blank counts without writing to Sheets', async () => {
    const worksheetResponse = await post(`/api/activities/${activityId}/guided-notes/worksheets`, {
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test-sheet-id/edit'
    });
    expect(worksheetResponse.status).toBe(200);
    expect(await worksheetResponse.json()).toEqual({
      spreadsheetId: 'test-sheet-id',
      worksheets: [{ sheetId: 7, title: '學習單' }]
    });

    const response = await post(`/api/activities/${activityId}/guided-notes/import`, { spreadsheetId: 'test-sheet-id', sheetId: 7 });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      source: { spreadsheetId: 'test-sheet-id', sheetId: 7, sheetTitle: '學習單' },
      questions: [{ questionNumber: 1, blankCount: 1 }]
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM activity_questions WHERE activity_id = ?').get(activityId)).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM guided_notes_blank_mappings').get()).toEqual({ count: 1 });
  });

  it('rejects an existing question-count mismatch without partially replacing local questions or source mappings', async () => {
    for (const questionNumber of [1, 2]) {
      db.prepare('INSERT INTO activity_questions (id, activity_id, question_number, created_at) VALUES (?, ?, ?, ?)')
        .run(`existing-${questionNumber}`, activityId, questionNumber, 'now');
    }
    const response = await post(`/api/activities/${activityId}/guided-notes/import`, { spreadsheetId: 'test-sheet-id', sheetId: 7 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'QUESTION_COUNT_MISMATCH' });
    expect(db.prepare('SELECT question_number FROM activity_questions WHERE activity_id = ? ORDER BY question_number').all(activityId))
      .toEqual([{ question_number: 1 }, { question_number: 2 }]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM guided_notes_sources').get()).toEqual({ count: 0 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM guided_notes_blank_mappings').get()).toEqual({ count: 0 });
  });

  it('rejects arbitrary URLs and sanitized access errors without exposing provider details', async () => {
    const invalid = await post(`/api/activities/${activityId}/guided-notes/worksheets`, { spreadsheetUrl: 'https://example.com/private' });
    expect(invalid.status).toBe(400);
    expect(gateway.listCalls).toBe(0);

    gateway.accessDenied = true;
    const denied = await post(`/api/activities/${activityId}/guided-notes/worksheets`, {
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test-sheet-id/edit'
    });
    expect(denied.status).toBe(403);
    const body = await denied.text();
    expect(body).toContain('SHEETS_ACCESS_DENIED');
    expect(body).not.toContain('remote private details');
  });
});
