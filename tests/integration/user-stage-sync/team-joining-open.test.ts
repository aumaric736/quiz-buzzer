import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../server/src/app.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import type { SheetsGateway, SheetsWorksheetGrid } from '../../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';
import { createTestDatabase, seedGuidedNotesQuestions } from '../../helpers/sqlite.js';

const worksheet: SheetsWorksheetGrid = {
  sheetId: 7, title: 'worksheet', rowCount: 2, columnCount: 3,
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

class RacingGateway implements SheetsGateway {
  readStarted: (() => void) | undefined;
  releaseRead: (() => void) | undefined;
  block = false;
  async listWorksheets() { return [{ sheetId: 7, title: 'worksheet' }]; }
  async readWorksheet() {
    if (this.block) {
      this.block = false;
      this.readStarted?.();
      await new Promise<void>((resolve) => { this.releaseRead = resolve; });
    }
    return worksheet;
  }
  async writeCellUpdates() { throw new Error('Import must not write to Sheets.'); }
}

describe('teacher open joining action', () => {
  let db: SqliteDatabase;
  let server: Server;
  let baseUrl: string;
  let teacherId: string;
  let activityId: string;
  let gateway: RacingGateway;

  beforeEach(async () => {
    db = createTestDatabase();
    teacherId = createSession(db, 'teacher').sessionId;
    activityId = createActivity(db, teacherId).activityId;
    gateway = new RacingGateway();
    server = createApp(db, undefined, undefined, { sheetsGateway: gateway }).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  });

  async function open(sessionId = teacherId) {
    return fetch(`${baseUrl}/api/activities/${activityId}/open-joining`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': sessionId }, body: '{}'
    });
  }

  it('rejects opening before worksheet readiness, then atomically records a durable open without changing phase', async () => {
    const notReady = await open();
    const notReadyBody = await notReady.json();
    expect(notReadyBody).toMatchObject({ code: 'QUESTIONS_REQUIRED' });
    expect(notReady.status).toBe(409);
    seedGuidedNotesQuestions(db, activityId);

    const opened = await open();
    expect(opened.status).toBe(200);
    const response = await opened.json() as { activityId: string; phase: string; joiningOpenedAt: string };
    expect(response).toMatchObject({ activityId, phase: '準備中', joiningOpenedAt: expect.any(String) });
    expect(db.prepare('SELECT phase, joining_opened_at AS joiningOpenedAt, live_revision AS liveRevision FROM activities WHERE id = ?').get(activityId))
      .toMatchObject({ phase: '準備中', joiningOpenedAt: expect.any(String), liveRevision: 1 });

    const restored = await fetch(`${baseUrl}/api/activities/${activityId}`, { headers: { 'X-Local-Session-Id': teacherId } });
    expect(await restored.json()).toMatchObject(response);
    const repeated = await open();
    expect(repeated.status).toBe(409);
    expect(await repeated.json()).toMatchObject({ code: 'JOINING_ALREADY_OPEN' });
  });

  it('requires the authenticated activity owner and a preparation-phase activity', async () => {
    seedGuidedNotesQuestions(db, activityId);
    const anotherTeacher = createSession(db, 'teacher').sessionId;
    const denied = await open(anotherTeacher);
    const deniedBody = await denied.json();
    expect(deniedBody).toMatchObject({ code: 'ACTIVITY_OWNER_REQUIRED' });
    expect(denied.status).toBe(403);

    db.prepare("UPDATE activities SET phase = '搶答進行中' WHERE id = ?").run(activityId);
    const wrongPhase = await open();
    expect(wrongPhase.status).toBe(409);
    expect(await wrongPhase.json()).toMatchObject({ code: 'JOINING_OPEN_PHASE_INVALID' });
  });

  it('rejects an import that was still reading the worksheet when the teacher opened joining', async () => {
    seedGuidedNotesQuestions(db, activityId);
    gateway.block = true;
    const started = new Promise<void>((resolve) => { gateway.readStarted = resolve; });
    const importing = fetch(`${baseUrl}/api/activities/${activityId}/guided-notes/import`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Local-Session-Id': teacherId },
      body: JSON.stringify({ spreadsheetId: 'test-sheet-id', sheetId: 7 })
    });
    await started;

    const opened = await open();
    expect(opened.status).toBe(200);
    gateway.releaseRead?.();
    const importResponse = await importing;
    expect(importResponse.status).toBe(409);
    expect(await importResponse.json()).toMatchObject({ code: 'GUIDED_NOTES_IMPORT_LOCKED' });
    expect(db.prepare('SELECT COUNT(*) AS count FROM guided_notes_blank_mappings').get()).toEqual({ count: 1 });
    expect(db.prepare('SELECT COUNT(*) AS count FROM guided_notes_sources WHERE activity_id = ?').get(activityId)).toEqual({ count: 1 });
  });
});
