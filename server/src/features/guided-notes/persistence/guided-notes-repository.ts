import { randomUUID } from 'node:crypto';
import type { DetectedGuidedNotesLayout } from '../domain/layout-recognizer.js';
import type { SqliteDatabase } from '../../user-stage-sync/persistence/database.js';
import { HttpError } from '../../../api/validation.js';

export interface SaveGuidedNotesImportInput {
  activityId: string;
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  layout: DetectedGuidedNotesLayout;
}

export interface SavedGuidedNotesImport {
  source: { spreadsheetId: string; sheetId: number; sheetTitle: string };
  questions: Array<{ questionNumber: number; blankCount: number }>;
  structureFingerprint: string;
}

export interface PersistedGuidedNotesSource {
  id: string;
  activityId: string;
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  structureFingerprint: string;
}

export interface PersistedBlankMapping {
  questionNumber: number;
  slotOrder: number;
  rowIndex: number;
  columnIndex: number;
  blankKind: string;
}

export function listActivityQuestions(db: SqliteDatabase, activityId: string): number[] {
  return (db.prepare('SELECT question_number FROM activity_questions WHERE activity_id = ? ORDER BY display_order').all(activityId) as Array<{ question_number: number }>)
    .map(({ question_number }) => question_number);
}

export function getGuidedNotesSource(db: SqliteDatabase, activityId: string): PersistedGuidedNotesSource | null {
  return (db.prepare(`SELECT id, activity_id AS activityId, spreadsheet_id AS spreadsheetId, sheet_id AS sheetId,
    sheet_title AS sheetTitle, structure_fingerprint AS structureFingerprint
    FROM guided_notes_sources WHERE activity_id = ?`).get(activityId) as PersistedGuidedNotesSource | undefined) ?? null;
}

export function listGuidedNotesMappings(db: SqliteDatabase, sourceId: string): PersistedBlankMapping[] {
  return db.prepare(`SELECT m.question_number AS questionNumber, m.slot_order AS slotOrder, m.row_index AS rowIndex,
    m.column_index AS columnIndex, m.blank_kind AS blankKind FROM guided_notes_blank_mappings m
    JOIN activity_questions q ON q.activity_id = m.activity_id AND q.question_number = m.question_number
    WHERE source_id = ? ORDER BY q.display_order, m.slot_order`).all(sourceId) as PersistedBlankMapping[];
}

/** Persist a recognized import as one short local transaction. */
export function saveGuidedNotesImport(db: SqliteDatabase, input: SaveGuidedNotesImportInput): SavedGuidedNotesImport {
  const save = db.transaction(() => {
    const activity = db.prepare('SELECT phase, joining_opened_at AS joiningOpenedAt FROM activities WHERE id = ?').get(input.activityId) as
      { phase: string; joiningOpenedAt: string | null } | undefined;
    if (!activity) throw new HttpError(404, 'ACTIVITY_NOT_FOUND', '找不到此活動。');
    if (activity.phase !== '準備中' || activity.joiningOpenedAt) {
      throw new HttpError(409, 'GUIDED_NOTES_IMPORT_LOCKED', '開放加入後學習單與題目清單已鎖定，無法重新匯入或更換。');
    }
    db.prepare('DELETE FROM activity_questions WHERE activity_id = ?').run(input.activityId);
    db.prepare('DELETE FROM guided_notes_sources WHERE activity_id = ?').run(input.activityId);
    const insertQuestion = db.prepare(`INSERT INTO activity_questions
      (id, activity_id, question_number, display_order, created_at) VALUES (?, ?, ?, ?, ?)`);
    const createdAt = new Date().toISOString();
    input.layout.questions.forEach((question, displayOrder) => {
      insertQuestion.run(randomUUID(), input.activityId, question.questionNumber, displayOrder, createdAt);
    });
    const sourceId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO guided_notes_sources
      (id, activity_id, spreadsheet_id, sheet_id, sheet_title, structure_fingerprint, imported_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sourceId, input.activityId, input.spreadsheetId, input.sheetId, input.sheetTitle, input.layout.structureFingerprint, now, now);

    const insertBlank = db.prepare(`INSERT INTO guided_notes_blank_mappings
      (source_id, activity_id, question_number, slot_order, row_index, column_index, blank_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const question of input.layout.questions) {
      for (const blank of question.blanks) {
        insertBlank.run(sourceId, input.activityId, blank.questionNumber, blank.slotOrder, blank.rowIndex, blank.columnIndex, blank.blankKind);
      }
    }

    return {
      source: { spreadsheetId: input.spreadsheetId, sheetId: input.sheetId, sheetTitle: input.sheetTitle },
      questions: input.layout.questions.map(({ questionNumber, blanks }) => ({ questionNumber, blankCount: blanks.length })),
      structureFingerprint: input.layout.structureFingerprint
    };
  });
  return save.immediate();
}
