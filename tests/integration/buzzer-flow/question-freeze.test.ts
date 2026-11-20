import { afterEach, describe, expect, it } from 'vitest';
import { HttpError } from '../../../server/src/api/validation.js';
import { createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import { importGuidedNotes } from '../../../server/src/features/guided-notes/application/import-guided-notes.js';
import type { SheetsGateway, SheetsWorksheetGrid } from '../../../server/src/features/guided-notes/google-sheets/sheets-gateway.js';
import { openDatabase, type SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { groupSampleGrid, shiftSampleGrid } from '../../helpers/guided-notes-sample-grids.js';

class SampleSheetsGateway implements SheetsGateway {
  async listWorksheets() { return [{ sheetId: 7, title: 'Group Sample' }]; }
  async readWorksheet(): Promise<SheetsWorksheetGrid> { return groupSampleGrid(); }
  async writeCellUpdates(): Promise<void> { throw new Error('Import must not write to Sheets.'); }
}

describe('Guided Notes question set freeze', () => {
  let db: SqliteDatabase | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  it('allows imports during preparation but preserves the imported data after the activity starts', async () => {
    db = openDatabase(':memory:');
    const teacherId = createSession(db, 'teacher').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    const gateway = new SampleSheetsGateway();
    const first = await importGuidedNotes(db, gateway, teacherId, activityId, { spreadsheetId: 'sheet-123456789', sheetId: 7 });
    const replacementGrid = shiftSampleGrid(groupSampleGrid(), 1, 0);
    const replacementGateway: SheetsGateway = {
      listWorksheets: async () => [{ sheetId: 7, title: 'Group Sample' }],
      readWorksheet: async () => replacementGrid,
      writeCellUpdates: async () => { throw new Error('Import must not write to Sheets.'); }
    };
    const replacement = await importGuidedNotes(db, replacementGateway, teacherId, activityId, { spreadsheetId: 'sheet-987654321', sheetId: 7 });
    expect(replacement.source.spreadsheetId).toBe('sheet-987654321');
    expect(replacement.questions).toEqual(first.questions);

    db.prepare("UPDATE activities SET phase = '搶答進行中', revision = 1 WHERE id = ?").run(activityId);
    const before = {
      source: db.prepare('SELECT id, spreadsheet_id, structure_fingerprint FROM guided_notes_sources WHERE activity_id = ?').get(activityId),
      questions: db.prepare('SELECT question_number FROM activity_questions WHERE activity_id = ? ORDER BY question_number').all(activityId),
      mappings: db.prepare('SELECT question_number, slot_order, row_index, column_index FROM guided_notes_blank_mappings ORDER BY question_number, slot_order').all()
    };
    const rejected = await importGuidedNotes(db, gateway, teacherId, activityId, { spreadsheetId: 'sheet-123456789', sheetId: 7 })
      .catch((error: unknown) => error);

    expect(rejected).toBeInstanceOf(HttpError);
    expect(rejected).toMatchObject({ code: 'GUIDED_NOTES_IMPORT_LOCKED' });
    expect({
      source: db.prepare('SELECT id, spreadsheet_id, structure_fingerprint FROM guided_notes_sources WHERE activity_id = ?').get(activityId),
      questions: db.prepare('SELECT question_number FROM activity_questions WHERE activity_id = ? ORDER BY question_number').all(activityId),
      mappings: db.prepare('SELECT question_number, slot_order, row_index, column_index FROM guided_notes_blank_mappings ORDER BY question_number, slot_order').all()
    }).toEqual(before);
  });

  it('keeps the question set locked after the activity has ended', async () => {
    db = openDatabase(':memory:');
    const teacherId = createSession(db, 'teacher').sessionId;
    const activityId = createActivity(db, teacherId).activityId;
    const gateway = new SampleSheetsGateway();
    await importGuidedNotes(db, gateway, teacherId, activityId, { spreadsheetId: 'sheet-123456789', sheetId: 7 });
    db.prepare("UPDATE activities SET phase = '已結束', revision = 2 WHERE id = ?").run(activityId);

    await expect(importGuidedNotes(db, gateway, teacherId, activityId, { spreadsheetId: 'sheet-123456789', sheetId: 7 }))
      .rejects.toMatchObject({ code: 'GUIDED_NOTES_IMPORT_LOCKED' });
  });
});
