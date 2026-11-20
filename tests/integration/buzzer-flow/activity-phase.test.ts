import { afterEach, describe, expect, it } from 'vitest';
import { transitionActivity, createActivity } from '../../../server/src/features/user-stage-sync/application/activity-service.js';
import { createSession } from '../../../server/src/features/user-stage-sync/application/session-service.js';
import type { SqliteDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';
import { openDatabase } from '../../../server/src/features/user-stage-sync/persistence/database.js';

function captureError(operation: () => unknown): unknown {
  try { operation(); } catch (error) { return error; }
  throw new Error('Expected operation to throw.');
}

describe('buzzer activity phase lifecycle', () => {
  let db: SqliteDatabase | undefined;
  afterEach(() => { db?.close(); db = undefined; });

  function addImportedQuestions(activityId: string): void {
    const sourceId = `source-${activityId}`;
    const now = new Date().toISOString();
    db!.prepare(`INSERT INTO guided_notes_sources
      (id, activity_id, spreadsheet_id, sheet_id, sheet_title, structure_fingerprint, imported_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sourceId, activityId, 'sheet-123456789', 1, 'Questions', 'fingerprint', now, now);
    const insertQuestion = db!.prepare('INSERT INTO activity_questions (id, activity_id, question_number, created_at) VALUES (?, ?, ?, ?)');
    const insertBlank = db!.prepare(`INSERT INTO guided_notes_blank_mappings
      (source_id, activity_id, question_number, slot_order, row_index, column_index, blank_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const questionNumber of [1, 3]) {
      insertQuestion.run(`question-${activityId}-${questionNumber}`, activityId, questionNumber, now);
      insertBlank.run(sourceId, activityId, questionNumber, 0, questionNumber, 1, 'text');
    }
  }

  it('requires imported questions and consistent blank mappings before starting', () => {
    db = openDatabase(':memory:');
    const teacherId = createSession(db, 'teacher').sessionId;
    const activity = createActivity(db, teacherId);

    expect(captureError(() => transitionActivity(db!, teacherId, activity.activityId, '搶答進行中')))
      .toMatchObject({ code: 'QUESTIONS_REQUIRED' });
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activity.activityId))
      .toEqual({ phase: '準備中', revision: 0 });

    addImportedQuestions(activity.activityId);
    expect(transitionActivity(db, teacherId, activity.activityId, '搶答進行中'))
      .toMatchObject({ phase: '搶答進行中', revision: 1 });
  });

  it('allows only the activity owner to move through the ordered manual lifecycle', () => {
    db = openDatabase(':memory:');
    const teacherId = createSession(db, 'teacher').sessionId;
    const anotherTeacherId = createSession(db, 'teacher').sessionId;
    const studentId = createSession(db, 'student').sessionId;
    const activity = createActivity(db, teacherId);
    addImportedQuestions(activity.activityId);

    expect(captureError(() => transitionActivity(db!, studentId, activity.activityId, '搶答進行中')))
      .toMatchObject({ code: 'TEACHER_REQUIRED' });
    expect(captureError(() => transitionActivity(db!, anotherTeacherId, activity.activityId, '搶答進行中')))
      .toMatchObject({ code: 'ACTIVITY_OWNER_REQUIRED' });

    expect(transitionActivity(db, teacherId, activity.activityId, '搶答進行中'))
      .toMatchObject({ phase: '搶答進行中', revision: 1 });
    expect(transitionActivity(db, teacherId, activity.activityId, '已結束'))
      .toMatchObject({ phase: '已結束', revision: 2 });
    expect(captureError(() => transitionActivity(db!, teacherId, activity.activityId, '已結束')))
      .toMatchObject({ code: 'INVALID_PHASE_TRANSITION' });
    expect(db.prepare('SELECT phase, revision FROM activities WHERE id = ?').get(activity.activityId))
      .toEqual({ phase: '已結束', revision: 2 });
  });
});
