import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { applyMigrations } from '../../server/src/features/user-stage-sync/persistence/database.js';
import { enrollGroup } from '../../server/src/features/user-stage-sync/application/group-service.js';

export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

/** Prepare the legacy scenario-based fixtures for enrollment without making unrelated tests
 * exercise the new teacher gate; gate behavior is tested directly in focused cases. */
export function enrollGroupForTest(db: Database.Database, sessionId: string, activityId: string, input: unknown) {
  const activity = db.prepare('SELECT joining_opened_at AS openedAt FROM activities WHERE id = ?').get(activityId) as { openedAt: string | null } | undefined;
  if (activity && !activity.openedAt) {
    // These scenario fixtures focus on behavior after enrollment. Dedicated tests call the
    // opening service and validate readiness before setting this persisted gate directly.
    db.prepare('UPDATE activities SET joining_opened_at = COALESCE(joining_opened_at, updated_at) WHERE id = ?').run(activityId);
  }
  return enrollGroup(db, sessionId, activityId, input);
}

export function seedGuidedNotesQuestions(db: Database.Database, activityId: string, questionNumbers: number[] = [1], blankCount = 1): void {
  const sourceId = `test-source-${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO guided_notes_sources
    (id, activity_id, spreadsheet_id, sheet_id, sheet_title, structure_fingerprint, imported_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(sourceId, activityId, `sheet-${randomUUID()}`, 1, 'Test Guided Notes', 'test-fingerprint', now, now);
  const insertQuestion = db.prepare('INSERT INTO activity_questions (id, activity_id, question_number, display_order, created_at) VALUES (?, ?, ?, ?, ?)');
  const insertBlank = db.prepare(`INSERT INTO guided_notes_blank_mappings
    (source_id, activity_id, question_number, slot_order, row_index, column_index, blank_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  questionNumbers.forEach((questionNumber, displayOrder) => {
    insertQuestion.run(randomUUID(), activityId, questionNumber, displayOrder, now);
    for (let slotOrder = 0; slotOrder < blankCount; slotOrder += 1) {
      insertBlank.run(sourceId, activityId, questionNumber, slotOrder, questionNumber * 100 + slotOrder, 1, 'text');
    }
  });
}
